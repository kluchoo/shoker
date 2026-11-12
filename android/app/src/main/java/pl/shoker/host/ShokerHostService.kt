package pl.shoker.host

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class ShokerHostService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopTable()
                return START_NOT_STICKY
            }
            ACTION_START, null -> startTable()
        }
        return START_STICKY
    }

    private fun startTable() {
        createChannel()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        HostRuntime.state = HostRuntime.State.Starting
        HostRuntime.errorMessage = null

        thread(name = "shoker-start") {
            // Wait out an in-flight stop so /start is not rejected.
            var waits = 0
            while (stopInProgress.get() && waits < 40) {
                Thread.sleep(100)
                waits += 1
            }

            if (nodeThreadStarted.compareAndSet(false, true)) {
                try {
                    val projectDir = AssetExtractor.ensureProject(applicationContext)
                    val entry = java.io.File(projectDir, "android-entry.js").absolutePath
                    Log.i(TAG, "Starting Node with $entry")
                    HostRuntime.nodeAlive = true
                    // node::Start blocks this thread for the process lifetime.
                    val code = NodeBridge.startNodeWithArguments(arrayOf("node", entry))
                    Log.i(TAG, "Node exited with $code")
                    HostRuntime.nodeAlive = false
                    nodeThreadStarted.set(false)
                    HostRuntime.state = HostRuntime.State.Error
                    HostRuntime.errorMessage = "Node zakończył pracę (kod $code)"
                } catch (error: Throwable) {
                    Log.e(TAG, "Node failed", error)
                    HostRuntime.nodeAlive = false
                    nodeThreadStarted.set(false)
                    HostRuntime.state = HostRuntime.State.Error
                    HostRuntime.errorMessage = error.message ?: error.toString()
                }
            } else {
                Log.i(TAG, "Node already alive — requesting HTTP start via control plane")
                val ok = StatusPoller.ensureStarted()
                if (!ok) {
                    Log.e(TAG, "Failed to restart HTTP server via control plane")
                    // Don't trip Error here if waitUntilReady can still succeed;
                    // only mark error when control plane is completely gone.
                    if (!StatusPoller.controlReachable()) {
                        HostRuntime.state = HostRuntime.State.Error
                        HostRuntime.errorMessage = "Nie udało się ponownie uruchomić stołu"
                    }
                }
            }
        }

        thread(name = "shoker-wait-ready") {
            waitUntilReady()
        }
    }

    private fun waitUntilReady() {
        val deadline = System.currentTimeMillis() + BOOT_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            val status = StatusPoller.fetch()
            if (status.running && status.reachable) {
                HostRuntime.state = HostRuntime.State.Running
                HostRuntime.lastStatus = status
                HostRuntime.errorMessage = null
                return
            }
            if (HostRuntime.state == HostRuntime.State.Error) return
            try {
                Thread.sleep(250)
            } catch (_: InterruptedException) {
                return
            }
        }
        if (HostRuntime.state != HostRuntime.State.Running) {
            HostRuntime.state = HostRuntime.State.Error
            HostRuntime.errorMessage = "Serwer nie wystartował w ciągu 15 sekund"
        }
    }

    private fun stopTable() {
        thread(name = "shoker-stop") {
            stopInProgress.set(true)
            try {
                StatusPoller.ensureStopped()
                HostRuntime.state = HostRuntime.State.Stopped
                HostRuntime.lastStatus = ServerStatus(running = false)
                HostRuntime.errorMessage = null
            } finally {
                stopInProgress.set(false)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
    }

    private fun createChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel),
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, ShokerHostService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(R.drawable.ic_stat_shoker)
            .setContentIntent(open)
            .addAction(0, "Zakończ stół", stop)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "ShokerHostService"
        private const val CHANNEL_ID = "shoker_host"
        private const val NOTIFICATION_ID = 42
        const val BOOT_TIMEOUT_MS = 15_000L
        const val ACTION_START = "pl.shoker.host.action.START"
        const val ACTION_STOP = "pl.shoker.host.action.STOP"

        private val nodeThreadStarted = AtomicBoolean(false)
        private val stopInProgress = AtomicBoolean(false)

        fun start(context: Context) {
            val intent = Intent(context, ShokerHostService::class.java).setAction(ACTION_START)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, ShokerHostService::class.java).setAction(ACTION_STOP)
            context.startService(intent)
        }
    }
}

object HostRuntime {
    enum class State { Stopped, Starting, Running, Error }

    @Volatile var state: State = State.Stopped
    @Volatile var nodeAlive: Boolean = false
    @Volatile var errorMessage: String? = null
    @Volatile var lastStatus: ServerStatus = ServerStatus()
}
