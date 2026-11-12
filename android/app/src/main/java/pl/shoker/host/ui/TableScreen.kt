package pl.shoker.host.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import pl.shoker.host.HostRuntime
import pl.shoker.host.HostUiState
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun TableScreen(
    state: HostUiState,
    onBackHome: () -> Unit,
    onEnd: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onHotspot: () -> Unit,
    onRefreshNetwork: () -> Unit,
    onPlayLocal: () -> Unit,
    onStart: () -> Unit,
    onReveal: () -> Unit,
    onNext: () -> Unit,
    onSkip: () -> Unit,
    onKick: (String) -> Unit,
    onWinner: (String) -> Unit,
    onReorder: (String, Int) -> Unit,
    onBump: (String, Double) -> Unit,
    onSoplica: (Int) -> Unit,
) {
    ScreenBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onBackHome) {
                    Text("← Menu", color = ShokerColors.accent)
                }
                StatusPill(
                    text = state.statusText,
                    active = state.serverState == HostRuntime.State.Running,
                )
            }

            Text(
                "Twój stół",
                style = MaterialTheme.typography.headlineMedium,
                color = ShokerColors.text,
            )
            Text(
                phaseLabel(state),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
            )

            ShareBlock(
                joinUrl = state.joinUrl,
                qr = state.qr,
                hotspotHint = state.hotspotHintVisible,
                onCopy = onCopy,
                onShare = onShare,
                onHotspot = onHotspot,
                onRefresh = onRefreshNetwork,
            )

            VerticalSpace(16)

            AdminPanel(
                game = state.game,
                serverRunning = state.serverState == HostRuntime.State.Running,
                onStart = onStart,
                onReveal = onReveal,
                onNext = onNext,
                onSkip = onSkip,
                onKick = onKick,
                onWinner = onWinner,
                onReorder = onReorder,
                onBump = onBump,
                onSoplica = onSoplica,
            )

            VerticalSpace(16)

            if (state.message != null) {
                Text(state.message, color = ShokerColors.accent, style = MaterialTheme.typography.bodyMedium)
                VerticalSpace(8)
            }
            if (state.error != null) {
                Text(state.error, color = ShokerColors.danger, style = MaterialTheme.typography.bodyMedium)
                VerticalSpace(8)
            }

            GhostButton(text = "Podgląd w przeglądarce", onClick = onPlayLocal)
            VerticalSpace(10)
            GhostButton(text = "Zakończ stół", onClick = onEnd)
            VerticalSpace(24)
        }
    }
}
