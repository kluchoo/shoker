package pl.shoker.host

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings

object HotspotHelper {

    fun looksLikeHotspotActive(): Boolean {
        return NetworkAddressFinder.candidates().any { candidate ->
            val name = candidate.interfaceName.lowercase()
            name.startsWith("ap") ||
                name.contains("softap") ||
                name.contains("swlan") ||
                name.contains("tether") ||
                (name.startsWith("wlan") && candidate.ip.startsWith("192.168."))
        }
    }

    fun openHotspotSettings(context: Context) {
        val intents = listOf(
            Intent("android.settings.TETHER_SETTINGS"),
            Intent(Settings.ACTION_WIRELESS_SETTINGS),
            Intent(Settings.ACTION_WIFI_SETTINGS),
        )
        for (intent in intents) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                return
            }
        }
    }

    @Suppress("DEPRECATION")
    fun wifiEnabled(context: Context): Boolean {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return true
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            true
        } else {
            wifi.isWifiEnabled
        }
    }
}
