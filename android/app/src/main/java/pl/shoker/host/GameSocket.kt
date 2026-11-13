package pl.shoker.host

import android.content.Context
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.util.UUID

class GameSocket(
    context: Context,
    private val onState: (GameState) -> Unit,
    private val onToast: (String) -> Unit,
) {
    private val prefs = context.getSharedPreferences("shoker_host", Context.MODE_PRIVATE)
    val clientId: String = prefs.getString(KEY_ID, null) ?: UUID.randomUUID().toString().also {
        prefs.edit().putString(KEY_ID, it).apply()
    }

    @Volatile private var socket: Socket? = null

    fun connect(url: String = "http://127.0.0.1:80") {
        disconnect()
        val opts = IO.Options.builder()
            .setForceNew(true)
            .setReconnection(true)
            .setReconnectionAttempts(Int.MAX_VALUE)
            .setReconnectionDelay(500)
            .setTimeout(8000)
            .build()
        val s = IO.socket(URI.create(url), opts)
        socket = s

        s.on(Socket.EVENT_CONNECT) {
            Log.i(TAG, "socket connected")
            s.emit("hello", JSONObject().put("clientId", clientId))
            s.emit("host", JSONObject())
        }
        s.on("state") { args ->
            val raw = args.firstOrNull() as? JSONObject ?: return@on
            runCatching { parseState(raw) }.onSuccess(onState).onFailure {
                Log.e(TAG, "state parse failed", it)
            }
        }
        s.on("toast") { args ->
            val raw = args.firstOrNull() as? JSONObject ?: return@on
            val message = raw.optString("message").ifBlank { return@on }
            onToast(message)
        }
        s.on(Socket.EVENT_DISCONNECT) {
            Log.i(TAG, "socket disconnected")
        }
        s.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e(TAG, "connect error: ${args.firstOrNull()}")
        }
        s.connect()
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
    }

    fun start() = emit("start")
    fun reveal() = emit("reveal")
    fun next() = emit("next")
    fun skip() = emit("skip")
    fun kick(playerId: String) = emit("kick", JSONObject().put("playerId", playerId))
    fun winner(playerId: String) = emit("winner", JSONObject().put("playerId", playerId))
    fun reorder(playerId: String, direction: Int) =
        emit("reorder", JSONObject().put("playerId", playerId).put("direction", direction))

    fun updateSettings(settings: GameSettings) {
        emit(
            "settings",
            JSONObject()
                .put("entry", settings.entry)
                .put("allIn", settings.allIn)
                .put("chambers", settings.chambers)
                .put("soplica", settings.soplica),
        )
    }

    private fun emit(event: String, payload: JSONObject? = null) {
        val s = socket ?: return
        if (payload == null) s.emit(event) else s.emit(event, payload)
    }

    private fun parseState(json: JSONObject): GameState {
        val settingsJson = json.optJSONObject("settings") ?: JSONObject()
        val hostJson = json.optJSONObject("host") ?: JSONObject()
        val you = json.optJSONObject("you") ?: JSONObject()
        val players = json.optJSONArray("players").orEmpty().mapNotNull { item ->
            val p = item as? JSONObject ?: return@mapNotNull null
            GamePlayer(
                id = p.optString("id"),
                nick = p.optString("nick"),
                connected = p.optBoolean("connected"),
                status = p.optString("status"),
                inHand = p.optBoolean("inHand"),
                dealer = p.optBoolean("dealer"),
                turn = p.optBoolean("turn"),
                winner = p.optBoolean("winner"),
                owed = p.optDouble("owed", 0.0),
                stake = p.optDouble("stake", 0.0),
            )
        }
        val alive = json.optJSONArray("alive").orEmpty().mapNotNull { item ->
            val p = item as? JSONObject ?: return@mapNotNull null
            AlivePlayer(id = p.optString("id"), nick = p.optString("nick"))
        }
        val log = json.optJSONArray("log").orEmpty().mapNotNull { it as? String }
        return GameState(
            phase = json.optString("phase", "lobby"),
            streetName = json.optString("streetName"),
            handNumber = json.optInt("handNumber"),
            prompt = json.optString("prompt").takeIf { it.isNotBlank() && !json.isNull("prompt") },
            settings = GameSettings(
                entry = settingsJson.optDouble("entry", 1.0),
                allIn = settingsJson.optDouble("allIn", 3.0),
                chambers = settingsJson.optInt("chambers", 5),
                soplica = settingsJson.optInt("soplica", 5),
            ),
            players = players,
            alive = alive,
            host = HostCapabilities(
                start = hostJson.optBoolean("start"),
                reveal = hostJson.optBoolean("reveal"),
                pick = hostJson.optBoolean("pick"),
                next = hostJson.optBoolean("next"),
                skip = hostJson.optBoolean("skip"),
                settings = hostJson.optBoolean("settings"),
                reorder = hostJson.optBoolean("reorder"),
            ),
            isHost = you.optBoolean("isHost"),
            log = log,
        )
    }

    private fun JSONArray?.orEmpty(): List<Any> {
        if (this == null) return emptyList()
        return List(length()) { get(it) }
    }

    companion object {
        private const val TAG = "GameSocket"
        private const val KEY_ID = "client_id"
    }
}
