package pl.shoker.host.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun ScreenBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val w = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        val h = constraints.maxHeight.toFloat().coerceAtLeast(1f)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(ShokerColors.bg),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                ShokerColors.accent.copy(alpha = 0.16f),
                                Color.Transparent,
                            ),
                            center = Offset(w * 0.5f, h * -0.05f),
                            radius = maxOf(w, h) * 0.85f,
                        ),
                    ),
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                Color(0xFF6084FF).copy(alpha = 0.10f),
                                Color.Transparent,
                            ),
                            center = Offset(w * 1.05f, h * 1.05f),
                            radius = maxOf(w, h) * 0.7f,
                        ),
                    ),
            )
            content()
        }
    }
}
