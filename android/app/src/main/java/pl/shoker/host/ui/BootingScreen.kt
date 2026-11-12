package pl.shoker.host.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import pl.shoker.host.HostUiState
import pl.shoker.host.ShokerHostService
import pl.shoker.host.ui.theme.ShokerColors
import kotlin.math.min

@Composable
fun BootingScreen(
    state: HostUiState,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
) {
    val failed = state.error != null
    val progress = if (failed) {
        1f
    } else {
        (state.bootElapsedMs.toFloat() / ShokerHostService.BOOT_TIMEOUT_MS.toFloat()).coerceIn(0f, 0.95f)
    }

    val spin by rememberInfiniteTransition(label = "boot-spin").animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "boot-spin-value",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ShokerColors.feltDeep)
            .statusBarsPadding()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                "Shoker",
                style = MaterialTheme.typography.headlineMedium,
                color = ShokerColors.brass,
            )

            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(120.dp)) {
                Canvas(
                    modifier = Modifier
                        .size(120.dp)
                        .graphicsLayer { rotationZ = if (failed) 0f else spin },
                ) {
                    val stroke = 8.dp.toPx()
                    val diameter = min(size.width, size.height) - stroke
                    val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
                    drawArc(
                        color = ShokerColors.chip,
                        startAngle = 0f,
                        sweepAngle = 360f,
                        useCenter = false,
                        topLeft = topLeft,
                        size = Size(diameter, diameter),
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                    drawArc(
                        color = if (failed) ShokerColors.ember else ShokerColors.brass,
                        startAngle = -90f,
                        sweepAngle = if (failed) 360f else bootSweep(progress),
                        useCenter = false,
                        topLeft = topLeft,
                        size = Size(diameter, diameter),
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                }
            }

            Text(
                if (failed) "Nie udało się uruchomić stołu" else "Podnoszę serwer…",
                style = MaterialTheme.typography.titleLarge,
                color = ShokerColors.ivory,
                textAlign = TextAlign.Center,
            )
            Text(
                state.error
                    ?: "Chwilę — Node startuje na telefonie.\nStół otworzy się automatycznie.",
                style = MaterialTheme.typography.bodyMedium,
                color = if (failed) ShokerColors.ember else ShokerColors.ivoryMute,
                textAlign = TextAlign.Center,
            )

            VerticalSpace(8)
            if (failed) {
                BrassButton(text = "Spróbuj ponownie", onClick = onRetry)
                VerticalSpace(8)
                GhostButton(text = "Wróć do menu", onClick = onCancel)
            } else {
                GhostButton(text = "Anuluj", onClick = onCancel)
            }
        }
    }
}

private fun bootSweep(progress: Float): Float {
    // Keep a moving arc so the wait feels alive even early in boot.
    return 70f + progress * 220f
}
