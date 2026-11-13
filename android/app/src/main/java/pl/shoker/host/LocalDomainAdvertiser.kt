package pl.shoker.host

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.net.InetAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.jmdns.JmDNS
import javax.jmdns.ServiceInfo

/**
 * Publishes an mDNS A record for shoker.local.
 *
 * NsdManager only registers DNS-SD services (`Name._http._tcp.local`).
 * Browsers that open http://shoker.local look up an A/AAAA record, which
 * NsdManager cannot publish, so this uses JmDNS on the current IPv4.
 */
object LocalDomainAdvertiser {
    private const val TAG = "ShokerMdns"
    private const val HOST_LABEL = "shoker"
    private const val WANTED_HOST = "shoker.local"
    private const val CHECK_MS = 2_000L

    private val gate = Any()
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile private var enabled = false
    @Volatile private var appContext: Context? = null

    private var jmdns: JmDNS? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private var boundIp: String? = null
    private var boundPort: Int = 0
    private var lastPosted: String? = UNSET
    private var postOk = false

    fun start(context: Context) {
        val app = context.applicationContext
        val target = handler()
        target.post {
            target.removeCallbacks(checkRunnable)
            appContext = app
            enabled = true
            check()
        }
    }

    fun stop(context: Context) {
        val app = context.applicationContext
        val target = handlerOrNull() ?: run {
            HostRuntime.mdns = MdnsSnapshot()
            return
        }
        if (android.os.Looper.myLooper() == target.looper) {
            shutdown(app)
            return
        }
        val done = CountDownLatch(1)
        target.post {
            try {
                shutdown(app)
            } finally {
                done.countDown()
            }
        }
        done.await(8, TimeUnit.SECONDS)
    }

    private fun shutdown(context: Context) {
        enabled = false
        handler?.removeCallbacks(checkRunnable)
        closeJmDns()
        releaseLock()
        HostRuntime.mdns = MdnsSnapshot()
        lastPosted = UNSET
        postOk = false
        runCatching { StatusPoller.postAdvertisedHost(null) }
        appContext = context.applicationContext
    }

    private fun check() {
        val target = this.handler ?: return
        if (!enabled) return
        try {
            val context = appContext
            val status = StatusPoller.fetch()
            val port = status.port
            if (!status.running || port <= 0 || context == null) {
                if (jmdns != null) {
                    closeJmDns()
                    publishName(null)
                }
                HostRuntime.mdns = MdnsSnapshot(
                    phase = MdnsPhase.Advertising,
                    message = "Czekam na serwer, zanim rozgłoszę shoker.local.",
                )
                return
            }

            val ip = NetworkAddressFinder.findBestIpv4()?.ip
            if (ip == null) {
                if (jmdns != null) closeJmDns()
                HostRuntime.mdns = MdnsSnapshot(
                    phase = MdnsPhase.Failed,
                    message = "Brak adresu IPv4. Włącz hotspot albo Wi-Fi. Gracze wejdą adresem IP, gdy wróci.",
                )
                publishName(null)
                return
            }

            if (jmdns == null || boundIp != ip || boundPort != port) {
                openJmDns(context, ip, port)
            } else {
                noteHostname(ip)
            }
        } catch (error: Exception) {
            Log.e(TAG, "mDNS check failed", error)
            HostRuntime.mdns = MdnsSnapshot(
                phase = MdnsPhase.Failed,
                message = "mDNS niedostępne (${error.javaClass.simpleName}: ${error.message}). Użyj adresu IP.",
            )
            publishName(null)
        } finally {
            schedule(target)
        }
    }

    private fun openJmDns(context: Context, ip: String, port: Int) {
        closeJmDns()
        boundIp = ip
        boundPort = port
        HostRuntime.mdns = MdnsSnapshot(
            phase = MdnsPhase.Advertising,
            address = ip,
            message = "Rozgłaszam shoker.local…",
        )
        try {
            acquireLock(context)
            val dns = JmDNS.create(InetAddress.getByName(ip), HOST_LABEL)
            jmdns = dns
            try {
                dns.registerService(
                    ServiceInfo.create("_http._tcp.local.", "Shoker", port, "path=/"),
                )
            } catch (error: Exception) {
                Log.w(TAG, "HTTP service record failed; hostname may still resolve", error)
            }
            Log.i(TAG, "mDNS bound $ip port $port")
            noteHostname(ip)
        } catch (error: Exception) {
            Log.e(TAG, "mDNS failed", error)
            closeJmDns()
            HostRuntime.mdns = MdnsSnapshot(
                phase = MdnsPhase.Failed,
                address = ip,
                message = "mDNS niedostępne (${error.javaClass.simpleName}: ${error.message}). Użyj adresu IP.",
            )
            publishName(null)
        }
    }

    private fun noteHostname(ip: String) {
        val dns = jmdns ?: return
        val raw = runCatching { dns.hostName }.getOrNull().orEmpty().trim().trimEnd('.')
        if (raw.isEmpty()) {
            HostRuntime.mdns = MdnsSnapshot(
                phase = MdnsPhase.Advertising,
                address = ip,
                message = "Rozgłaszam shoker.local…",
            )
            return
        }
        val host = if (raw.endsWith(".local", ignoreCase = true)) raw else "$raw.local"
        val conflict = !host.equals(WANTED_HOST, ignoreCase = true)
        HostRuntime.mdns = if (conflict) {
            MdnsSnapshot(
                phase = MdnsPhase.Conflict,
                hostname = host,
                address = ip,
                message = "Nazwa shoker.local jest zajęta. Rozgłaszam $host. Awaryjnie użyj adresu IP.",
            )
        } else {
            MdnsSnapshot(
                phase = MdnsPhase.Ready,
                hostname = host,
                address = ip,
                message = null,
            )
        }
        publishName(host)
    }

    private fun publishName(name: String?) {
        if (postOk && name == lastPosted) return
        val posted = name
        val ok = runCatching { StatusPoller.postAdvertisedHost(posted) }.getOrDefault(false)
        if (ok) {
            lastPosted = posted
            postOk = true
        } else {
            postOk = false
        }
    }

    private fun closeJmDns() {
        val dns = jmdns
        jmdns = null
        boundIp = null
        boundPort = 0
        if (dns == null) return
        runCatching { dns.unregisterAllServices() }
        runCatching { dns.close() }
    }

    @Suppress("DEPRECATION")
    private fun acquireLock(context: Context) {
        if (multicastLock?.isHeld == true) return
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return
        multicastLock = wifi.createMulticastLock("shoker-mdns").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseLock() {
        runCatching {
            if (multicastLock?.isHeld == true) multicastLock?.release()
        }
        multicastLock = null
    }

    private val checkRunnable = Runnable { check() }

    private fun schedule(handler: Handler) {
        if (!enabled) return
        handler.removeCallbacks(checkRunnable)
        handler.postDelayed(checkRunnable, CHECK_MS)
    }

    private fun handler(): Handler {
        handlerOrNull()?.let { return it }
        synchronized(gate) {
            handler?.let { return it }
            val thread = HandlerThread("shoker-mdns")
            thread.start()
            val created = Handler(thread.looper)
            handlerThread = thread
            handler = created
            return created
        }
    }

    private fun handlerOrNull(): Handler? = handler

    private const val UNSET = "\u0000unset"
}

enum class MdnsPhase { Idle, Advertising, Ready, Conflict, Failed }

data class MdnsSnapshot(
    val phase: MdnsPhase = MdnsPhase.Idle,
    val hostname: String? = null,
    val address: String? = null,
    val message: String? = null,
)
