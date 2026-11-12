package pl.shoker.host

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ServerStatus(
    val running: Boolean = false,
    val phase: String? = null,
    val playerCount: Int = 0,
    val connectedCount: Int = 0,
    val port: Int = 3000,
    val reachable: Boolean = false,
    val error: String? = null,
)

object StatusPoller {
    private const val STATUS_URL = "http://127.0.0.1:3000/api/status"
    private const val CONTROL_STATUS_URL = "http://127.0.0.1:3010/status"

    fun poll(intervalMs: Long = 1000L): Flow<ServerStatus> = flow {
        while (true) {
            emit(fetch())
            delay(intervalMs)
        }
    }.flowOn(Dispatchers.IO)

    fun fetch(): ServerStatus {
        val primary = getJson(STATUS_URL)
        if (primary != null) return parse(primary, reachable = true)
        val control = getJson(CONTROL_STATUS_URL)
        if (control != null) return parse(control, reachable = true)
        return ServerStatus(reachable = false, error = "Serwer nie odpowiada")
    }

    fun postControl(path: String): Boolean {
        return try {
            val url = URL("http://127.0.0.1:3010$path")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 3000
                readTimeout = 8000
                doOutput = true
            }
            conn.outputStream.use { it.write(ByteArray(0)) }
            val code = conn.responseCode
            conn.disconnect()
            code in 200..299
        } catch (_: Exception) {
            false
        }
    }

    private fun getJson(urlValue: String): JSONObject? {
        return try {
            val conn = (URL(urlValue).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 1200
                readTimeout = 1200
            }
            val code = conn.responseCode
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            if (code in 200..299) JSONObject(body) else null
        } catch (_: Exception) {
            null
        }
    }

    private fun parse(json: JSONObject, reachable: Boolean): ServerStatus {
        return ServerStatus(
            running = json.optBoolean("running", false),
            phase = if (json.isNull("phase")) null else json.optString("phase"),
            playerCount = json.optInt("playerCount", 0),
            connectedCount = json.optInt("connectedCount", 0),
            port = json.optInt("port", 3000),
            reachable = reachable,
        )
    }
}
