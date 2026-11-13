package pl.shoker.host

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class AppScreen { Home, Instructions, Booting, Table }

data class HostUiState(
    val screen: AppScreen = AppScreen.Home,
    val serverState: HostRuntime.State = HostRuntime.State.Stopped,
    val statusText: String = "Zatrzymany",
    val joinUrl: String? = null,
    val preferredUrl: String? = null,
    val fallbackUrl: String? = null,
    val qrUsesFallback: Boolean = false,
    val mdnsNote: String? = null,
    val portNote: String? = null,
    val hostIp: String? = null,
    val port: Int = 80,
    val playerCount: Int = 0,
    val connectedCount: Int = 0,
    val phase: String? = null,
    val qr: Bitmap? = null,
    val hotspotHintVisible: Boolean = true,
    val error: String? = null,
    val message: String? = null,
    val game: GameState = GameState(),
    val socketReady: Boolean = false,
    val bootStartedAtMs: Long = 0L,
    val bootElapsedMs: Long = 0L,
)

class HostViewModel(app: Application) : AndroidViewModel(app) {
    private val _ui = MutableStateFlow(HostUiState())
    val ui: StateFlow<HostUiState> = _ui.asStateFlow()

    private val _shareRequests = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val shareRequests: SharedFlow<String> = _shareRequests.asSharedFlow()

    private var pollJob: Job? = null
    private var socketConnectedForSession = false
    private var socketUrl: String? = null
    private var qrPreferFallback = false
    private var lastQrUrl: String? = null
    private val gameSocket = GameSocket(
        context = app,
        onState = { game ->
            _ui.update {
                it.copy(
                    game = game,
                    socketReady = true,
                    playerCount = game.players.size,
                    connectedCount = game.players.count { p -> p.connected },
                    phase = game.phase,
                )
            }
        },
        onToast = { message ->
            _ui.update { it.copy(message = message) }
        },
    )

    init {
        refreshNetwork()
        startPolling()
        if (HostRuntime.state == HostRuntime.State.Running) {
            _ui.update { it.copy(screen = AppScreen.Table) }
            ensureSocket(HostRuntime.lastStatus.port.takeIf { it > 0 } ?: _ui.value.port)
        }
    }

    fun goHome() {
        _ui.update { it.copy(screen = AppScreen.Home, error = null) }
    }

    fun openInstructions() {
        _ui.update { it.copy(screen = AppScreen.Instructions, error = null) }
    }

    fun openTableScreen() {
        if (HostRuntime.state == HostRuntime.State.Running || HostRuntime.state == HostRuntime.State.Starting) {
            _ui.update { it.copy(screen = AppScreen.Table) }
        }
    }

    fun refreshNetwork() {
        val best = NetworkAddressFinder.findBestIpv4()
        _ui.update {
            it.copy(
                hostIp = best?.ip,
                hotspotHintVisible = !HotspotHelper.looksLikeHotspotActive(),
            )
        }
        rebuildLinks()
    }

    fun toggleQr() {
        val state = _ui.value
        if (state.preferredUrl == null || state.fallbackUrl == null) return
        qrPreferFallback = !state.qrUsesFallback
        rebuildLinks()
    }

    fun createTable() {
        refreshNetwork()
        if (_ui.value.hostIp == null) {
            _ui.update {
                it.copy(
                    error = "Brak adresu IPv4. Włącz hotspot, wróć tutaj i spróbuj ponownie.",
                    hotspotHintVisible = true,
                    screen = AppScreen.Home,
                )
            }
            return
        }
        socketConnectedForSession = false
        HostRuntime.errorMessage = null
        HostRuntime.state = HostRuntime.State.Starting
        val startedAt = System.currentTimeMillis()
        _ui.update {
            it.copy(
                screen = AppScreen.Booting,
                serverState = HostRuntime.State.Starting,
                statusText = "Uruchamianie",
                error = null,
                message = null,
                game = GameState(),
                socketReady = false,
                bootStartedAtMs = startedAt,
                bootElapsedMs = 0L,
            )
        }
        ShokerHostService.start(getApplication())
    }

    fun cancelBoot() {
        gameSocket.disconnect()
        socketConnectedForSession = false
        socketUrl = null
        ShokerHostService.stop(getApplication())
        HostRuntime.errorMessage = null
        HostRuntime.state = HostRuntime.State.Stopped
        _ui.update {
            it.copy(
                screen = AppScreen.Home,
                serverState = HostRuntime.State.Stopped,
                statusText = "Zatrzymany",
                error = null,
                message = null,
                socketReady = false,
                bootStartedAtMs = 0L,
                bootElapsedMs = 0L,
            )
        }
    }

    fun endTable() {
        gameSocket.disconnect()
        socketConnectedForSession = false
        socketUrl = null
        ShokerHostService.stop(getApplication())
        _ui.update {
            it.copy(
                screen = AppScreen.Home,
                serverState = HostRuntime.State.Stopped,
                statusText = "Zatrzymany",
                playerCount = 0,
                connectedCount = 0,
                phase = null,
                socketReady = false,
                game = GameState(),
                message = "Stół zakończony",
            )
        }
    }

    fun openHotspotSettings() {
        HotspotHelper.openHotspotSettings(getApplication())
    }

    fun copyLink(): Boolean {
        val url = _ui.value.joinUrl ?: return false
        val clipboard = getApplication<Application>().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Shoker", url))
        _ui.update { it.copy(message = "Skopiowano adres stołu") }
        return true
    }

    fun shareLink() {
        val url = _ui.value.joinUrl ?: return
        _shareRequests.tryEmit(url)
    }

    fun openLocalGame() {
        val tabs = CustomTabsIntent.Builder().build()
        tabs.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val port = _ui.value.port.takeIf { it > 0 } ?: 80
        tabs.launchUrl(getApplication(), "http://127.0.0.1:$port".toUri())
    }

    fun clearMessage() {
        _ui.update { it.copy(message = null) }
    }

    fun startHand() = gameSocket.start()
    fun reveal() = gameSocket.reveal()
    fun nextHand() = gameSocket.next()
    fun skipTurn() = gameSocket.skip()
    fun kick(playerId: String) = gameSocket.kick(playerId)
    fun pickWinner(playerId: String) = gameSocket.winner(playerId)
    fun reorder(playerId: String, direction: Int) = gameSocket.reorder(playerId, direction)

    fun bumpSetting(field: String, delta: Double) {
        val current = _ui.value.game.settings
        if (!_ui.value.game.host.settings) return
        val next = when (field) {
            "entry" -> {
                val clampedEntry = (((current.entry + delta) * 2).toInt() / 2.0).coerceIn(0.5, 20.0)
                // All-in ≥ 3× wejście (rozdanie + flop + turn).
                val minAllIn = kotlin.math.round(clampedEntry * 3 * 2) / 2.0
                current.copy(
                    entry = clampedEntry,
                    allIn = maxOf(current.allIn, minAllIn).coerceIn(minAllIn, 60.0),
                )
            }
            "allIn" -> {
                val minAllIn = kotlin.math.round(current.entry * 3 * 2) / 2.0
                val allIn = ((current.allIn + delta) * 2).toInt() / 2.0
                current.copy(allIn = allIn.coerceIn(minAllIn, 60.0))
            }
            "chambers" -> current.copy(chambers = (current.chambers + delta.toInt()).coerceIn(2, 12))
            "soplica" -> current.copy(soplica = (current.soplica + delta.toInt()).coerceIn(0, 100))
            else -> return
        }
        if (next == current) return
        gameSocket.updateSettings(next)
    }

    fun setSoplica(value: Int) {
        if (!_ui.value.game.host.settings) return
        val current = _ui.value.game.settings
        gameSocket.updateSettings(current.copy(soplica = value.coerceIn(0, 100)))
    }

    private fun ensureSocket(port: Int) {
        if (port <= 0) return
        val url = "http://127.0.0.1:$port"
        if (socketConnectedForSession && socketUrl == url) return
        val first = socketUrl == null
        socketUrl = url
        socketConnectedForSession = true
        viewModelScope.launch(Dispatchers.IO) {
            if (first) delay(300)
            withContext(Dispatchers.Main) {
                if (socketUrl == url) gameSocket.connect(url)
            }
        }
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive) {
                syncFromRuntime()
                delay(800)
            }
        }
    }

    private fun syncFromRuntime() {
        val runtimeState = HostRuntime.state
        val polled = if (runtimeState == HostRuntime.State.Running || runtimeState == HostRuntime.State.Starting) {
            StatusPoller.fetch()
        } else {
            null
        }
        val status = when {
            polled == null -> HostRuntime.lastStatus
            polled.reachable -> {
                HostRuntime.lastStatus = polled
                if (polled.running) HostRuntime.state = HostRuntime.State.Running
                polled
            }
            HostRuntime.state == HostRuntime.State.Running -> HostRuntime.lastStatus
            else -> polled
        }

        val best = NetworkAddressFinder.findBestIpv4()
        val port = status.port.takeIf { it > 0 } ?: _ui.value.port
        val portNote = if (polled != null && polled.reachable) polled.portWarning else _ui.value.portNote

        if (HostRuntime.state == HostRuntime.State.Running) {
            ensureSocket(port)
        }

        val state = HostRuntime.state
        val now = System.currentTimeMillis()
        val bootStarted = _ui.value.bootStartedAtMs
        val bootElapsed = if (bootStarted > 0L) now - bootStarted else 0L
        val bootTimedOut = bootStarted > 0L && bootElapsed >= ShokerHostService.BOOT_TIMEOUT_MS

        // During boot only surface an error after the full timeout window.
        if (
            _ui.value.screen == AppScreen.Booting &&
            state == HostRuntime.State.Starting &&
            bootTimedOut &&
            HostRuntime.errorMessage == null
        ) {
            HostRuntime.state = HostRuntime.State.Error
            HostRuntime.errorMessage = "Serwer nie wystartował w ciągu 15 sekund"
        }

        val effectiveState = HostRuntime.state
        val bootError = if (
            _ui.value.screen == AppScreen.Booting &&
            (effectiveState == HostRuntime.State.Error || bootTimedOut)
        ) {
            HostRuntime.errorMessage ?: "Serwer nie wystartował w ciągu 15 sekund"
        } else {
            null
        }

        _ui.update {
            val nextScreen = when {
                it.screen == AppScreen.Booting && effectiveState == HostRuntime.State.Running -> AppScreen.Table
                it.screen == AppScreen.Booting && effectiveState == HostRuntime.State.Error -> AppScreen.Booting
                effectiveState == HostRuntime.State.Stopped &&
                    it.screen == AppScreen.Table &&
                    !socketConnectedForSession -> AppScreen.Home
                else -> it.screen
            }
            it.copy(
                serverState = effectiveState,
                statusText = when (effectiveState) {
                    HostRuntime.State.Stopped -> "Zatrzymany"
                    HostRuntime.State.Starting -> "Uruchamianie"
                    HostRuntime.State.Running -> "Aktywny"
                    HostRuntime.State.Error -> "Błąd"
                },
                playerCount = if (it.socketReady) it.playerCount else status.playerCount,
                connectedCount = if (it.socketReady) it.connectedCount else status.connectedCount,
                phase = if (it.socketReady) it.phase else status.phase,
                hostIp = best?.ip,
                hotspotHintVisible = !HotspotHelper.looksLikeHotspotActive(),
                port = port,
                portNote = portNote,
                error = bootError,
                bootElapsedMs = bootElapsed,
                screen = nextScreen,
            )
        }
        rebuildLinks()
    }

    private fun rebuildLinks() {
        val current = _ui.value
        val ipUrl = current.hostIp?.let { NetworkAddressFinder.httpUrl(it, current.port) }
        val mdns = HostRuntime.mdns
        val domain = when (mdns.phase) {
            MdnsPhase.Ready, MdnsPhase.Conflict ->
                mdns.hostname?.let { NetworkAddressFinder.httpUrl(it, current.port) }
            else -> null
        }
        val preferred = domain ?: ipUrl
        val fallback = if (domain != null && ipUrl != null && domain != ipUrl) ipUrl else null
        val useFallback = fallback != null && qrPreferFallback
        val active = if (useFallback) fallback else preferred
        val qr = when {
            active == null -> {
                lastQrUrl = null
                null
            }
            active == lastQrUrl -> current.qr
            else -> {
                lastQrUrl = active
                runCatching { QrBitmap.fromUrl(active) }.getOrNull()
            }
        }
        _ui.update {
            it.copy(
                preferredUrl = preferred,
                fallbackUrl = fallback,
                joinUrl = active,
                qr = qr,
                qrUsesFallback = useFallback,
                mdnsNote = mdns.message,
            )
        }
    }

    override fun onCleared() {
        gameSocket.disconnect()
        super.onCleared()
    }
}
