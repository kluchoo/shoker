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
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class HostUiState(
    val serverState: HostRuntime.State = HostRuntime.State.Stopped,
    val statusText: String = "Zatrzymany",
    val joinUrl: String? = null,
    val hostIp: String? = null,
    val port: Int = 3000,
    val playerCount: Int = 0,
    val connectedCount: Int = 0,
    val phase: String? = null,
    val qr: Bitmap? = null,
    val hotspotHintVisible: Boolean = true,
    val error: String? = null,
    val message: String? = null,
)

class HostViewModel(app: Application) : AndroidViewModel(app) {
    private val _ui = MutableStateFlow(HostUiState())
    val ui: StateFlow<HostUiState> = _ui.asStateFlow()

    private var pollJob: Job? = null

    init {
        refreshNetwork()
        startPolling()
    }

    fun refreshNetwork() {
        val best = NetworkAddressFinder.findBestIpv4()
        val port = _ui.value.port
        val url = best?.let { NetworkAddressFinder.joinUrl(it.ip, port) }
        val qr = url?.let { runCatching { QrBitmap.fromUrl(it) }.getOrNull() }
        _ui.update {
            it.copy(
                hostIp = best?.ip,
                joinUrl = url,
                qr = qr,
                hotspotHintVisible = !HotspotHelper.looksLikeHotspotActive(),
            )
        }
    }

    fun createTable() {
        refreshNetwork()
        if (_ui.value.hostIp == null) {
            _ui.update {
                it.copy(
                    error = "Brak adresu IPv4. Włącz hotspot i połącz urządzenia z siecią telefonu.",
                    hotspotHintVisible = true,
                )
            }
            return
        }
        _ui.update {
            it.copy(
                serverState = HostRuntime.State.Starting,
                statusText = "Uruchamianie",
                error = null,
                message = null,
            )
        }
        ShokerHostService.start(getApplication())
    }

    fun endTable() {
        ShokerHostService.stop(getApplication())
        _ui.update {
            it.copy(
                serverState = HostRuntime.State.Stopped,
                statusText = "Zatrzymany",
                playerCount = 0,
                connectedCount = 0,
                phase = null,
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
        _ui.update { it.copy(message = "Skopiowano link") }
        return true
    }

    fun openLocalGame() {
        val tabs = CustomTabsIntent.Builder().build()
        tabs.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        tabs.launchUrl(getApplication(), "http://127.0.0.1:3000".toUri())
    }

    fun clearMessage() {
        _ui.update { it.copy(message = null) }
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive) {
                syncFromRuntime()
                delay(1000)
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

        refreshNetworkIfNeeded()

        val state = HostRuntime.state
        val showPollError =
            state != HostRuntime.State.Running &&
                state != HostRuntime.State.Stopped &&
                status.error != null
        _ui.update {
            it.copy(
                serverState = state,
                statusText = when (state) {
                    HostRuntime.State.Stopped -> "Zatrzymany"
                    HostRuntime.State.Starting -> "Uruchamianie"
                    HostRuntime.State.Running -> "Aktywny"
                    HostRuntime.State.Error -> "Błąd"
                },
                playerCount = status.playerCount,
                connectedCount = status.connectedCount,
                phase = status.phase,
                port = status.port.takeIf { p -> p > 0 } ?: 3000,
                error = HostRuntime.errorMessage ?: if (showPollError) status.error else null,
            )
        }
    }

    private fun refreshNetworkIfNeeded() {
        if (_ui.value.hostIp == null || _ui.value.hotspotHintVisible) {
            refreshNetwork()
        }
    }
}
