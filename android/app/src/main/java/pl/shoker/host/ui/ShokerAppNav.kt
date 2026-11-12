package pl.shoker.host.ui

import androidx.compose.runtime.Composable
import pl.shoker.host.AppScreen
import pl.shoker.host.HostUiState

@Composable
fun ShokerAppNav(
    state: HostUiState,
    onCreate: () -> Unit,
    onInstructions: () -> Unit,
    onResumeTable: () -> Unit,
    onBackHome: () -> Unit,
    onCancelBoot: () -> Unit,
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
    when (state.screen) {
        AppScreen.Home -> HomeScreen(
            state = state,
            onCreate = onCreate,
            onInstructions = onInstructions,
            onResumeTable = onResumeTable,
            onHotspot = onHotspot,
        )
        AppScreen.Instructions -> InstructionsScreen(onBack = onBackHome)
        AppScreen.Booting -> BootingScreen(
            state = state,
            onCancel = onCancelBoot,
            onRetry = onCreate,
        )
        AppScreen.Table -> TableScreen(
            state = state,
            onBackHome = onBackHome,
            onEnd = onEnd,
            onCopy = onCopy,
            onShare = onShare,
            onHotspot = onHotspot,
            onRefreshNetwork = onRefreshNetwork,
            onPlayLocal = onPlayLocal,
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
    }
}
