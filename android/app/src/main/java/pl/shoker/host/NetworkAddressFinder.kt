package pl.shoker.host

import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkAddressFinder {

    data class HostAddress(
        val ip: String,
        val interfaceName: String,
        val score: Int,
    )

    fun findBestIpv4(): HostAddress? = candidates().firstOrNull()

    fun candidates(): List<HostAddress> {
        val found = mutableListOf<HostAddress>()
        val interfaces = runCatching { NetworkInterface.getNetworkInterfaces() }.getOrNull() ?: return emptyList()

        for (netif in interfaces) {
            if (!netif.isUp || netif.isLoopback) continue
            val name = netif.name.lowercase()
            if (name.contains("dummy") || name.contains("rmnet") && !name.contains("wlan")) {
                // keep softap / wlan / ap; skip most cellular unless nothing else
            }
            for (address in netif.inetAddresses) {
                if (address !is Inet4Address) continue
                if (address.isLoopbackAddress) continue
                val host = address.hostAddress ?: continue
                if (host.startsWith("169.254.")) continue
                found += HostAddress(host, netif.name, score(name, host))
            }
        }

        return found.sortedWith(compareBy({ it.score }, { it.ip }))
    }

    fun joinUrl(ip: String, port: Int = 3000): String = "http://$ip:$port"

    private fun score(iface: String, ip: String): Int {
        var value = 50
        when {
            iface.startsWith("ap") || iface.contains("softap") || iface.contains("swlan") -> value = 0
            iface.startsWith("wlan") || iface.startsWith("wifi") -> value = 10
            iface.contains("tether") || iface.contains("rndis") -> value = 15
            iface.startsWith("eth") -> value = 20
            iface.contains("rmnet") || iface.contains("ccmni") -> value = 80
        }
        value += when {
            ip.startsWith("192.168.") -> 0
            ip.startsWith("10.") -> 2
            ip.matches(Regex("^172\\.(1[6-9]|2\\d|3[0-1])\\..*")) -> 4
            else -> 10
        }
        return value
    }
}
