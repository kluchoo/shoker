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
    val port: Int = 80,
    val portWarning: String? = null,
    val reachable: Boolean = false,
    val error: String? = null,
)

data class ControlResult(
    val ok: Boolean,
    val code: Int = 0,
    val body: String = "",
)

object StatusPoller {
    private const val CONTROL_STATUS_URL = "http://127.0.0.1:3010/status"
    private const val CONTROL_BASE = "http://127.0.0.1:3010"

    @Volatile private var gamePort: Int = 0

    fun poll(intervalMs: Long = 1000L): Flow<ServerStatus> = flow {
        while (true) {
            emit(fetch())
            delay(intervalMs)
        }
    }.flowOn(Dispatchers.IO)

    fun fetch(): ServerStatus {
        val control = getJson(CONTROL_STATUS_URL)
        if (control != null) {
            val status = parse(control, reachable = true)
            if (status.port > 0) gamePort = status.port
            return status
        }
        val ports = listOfNotNull(gamePort.takeIf { it > 0 }, 80, 8080, 3000).distinct()
        for (port in ports) {
            val json = getJson("http://127.0.0.1:$port/api/status") ?: continue
            gamePort = port
            return parse(json, reachable = true)
        }
        return ServerStatus(reachable = false, error = "Serwer nie odpowiada")
    }

    fun postAdvertisedHost(name: String?): Boolean {
        val quoted = if (name == null) "null" else JSONObject.quote(name)
        val payload = """{"name":$quoted}"""
        return try {
            val conn = (URL("$CONTROL_BASE/host").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 2000
                readTimeout = 4000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            code in 200..299
        } catch (_: Exception) {
            false
        }
    }

    fun controlReachable(): Boolean = getJson(CONTROL_STATUS_URL) != null

    fun postControl(path: String): ControlResult {
        return try {
            val url = URL("$CONTROL_BASE$path")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 3000
                readTimeout = 12_000
                doOutput = true
            }
            conn.outputStream.use { it.write(ByteArray(0)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            ControlResult(ok = code in 200..299, code = code, body = body)
        } catch (error: Exception) {
            ControlResult(ok = false, code = -1, body = error.message.orEmpty())
        }
    }

    /** Ask control plane to start HTTP; retries through stop races / EADDRINUSE. */
    fun ensureStarted(maxAttempts: Int = 10): Boolean {
        repeat(maxAttempts) { attempt ->
            val status = fetch()
            if (status.running && status.reachable) return true

            if (!controlReachable()) {
                Thread.sleep(300L * (attempt + 1))
                return@repeat
            }

            val result = postControl("/start")
            if (result.ok) {
                // Give Express a beat to bind before caller polls.
                Thread.sleep(200)
                if (fetch().running) return true
            }
            Thread.sleep(350L * (attempt + 1))
        }
        return fetch().running
    }

    fun ensureStopped(maxAttempts: Int = 8): Boolean {
        var stopAcked = false
        repeat(maxAttempts) { attempt ->
            val status = fetch()
            // Only treat "not running" as done after we got a stop ACK,
            // otherwise we can race a still-closing listen socket.
            if (!status.running && (stopAcked || !controlReachable())) {
                Thread.sleep(200)
                return true
            }
            val result = postControl("/stop")
            if (result.ok) {
                stopAcked = true
                Thread.sleep(200)
                if (!fetch().running) return true
            }
            Thread.sleep(250L * (attempt + 1))
        }
        return !fetch().running
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
            port = json.optInt("port", 80),
            portWarning = json.optString("portWarning").ifBlank { null },
            reachable = reachable,
        )
    }
}
