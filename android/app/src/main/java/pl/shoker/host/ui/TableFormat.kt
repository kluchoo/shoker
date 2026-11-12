package pl.shoker.host.ui

import pl.shoker.host.HostRuntime
import pl.shoker.host.HostUiState

fun phaseLabel(state: HostUiState): String {
    val game = state.game
    return when {
        state.serverState == HostRuntime.State.Starting -> "Podnoszę serwer…"
        game.phase == "lobby" -> "Lobby — ustaw stawki i czekaj na graczy"
        game.handNumber > 0 -> "Rozdanie ${game.handNumber} · ${game.streetName.ifBlank { game.phase }}"
        else -> game.phase
    }
}

fun formatDrinks(amount: Double): String {
    val rounded = kotlin.math.round(amount * 2) / 2.0
    return if (rounded == rounded.toLong().toDouble()) {
        "${rounded.toLong()}"
    } else {
        String.format("%.1f", rounded).replace('.', ',')
    }
}
