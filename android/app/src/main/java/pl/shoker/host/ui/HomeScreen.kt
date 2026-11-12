package pl.shoker.host.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.shoker.host.HostRuntime
import pl.shoker.host.HostUiState
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun HomeScreen(
    state: HostUiState,
    onCreate: () -> Unit,
    onInstructions: () -> Unit,
    onResumeTable: () -> Unit,
    onHotspot: () -> Unit,
) {
    val enter = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        enter.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ShokerColors.feltDeep),
    ) {
        // Soft liquor glow — one atmospheric plane, not a card collage
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            ShokerColors.brass.copy(alpha = 0.16f),
                            ShokerColors.feltDeep.copy(alpha = 0f),
                        ),
                        radius = 900f,
                    ),
                ),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            ShokerColors.feltDeep.copy(alpha = 0.2f),
                            ShokerColors.feltDeep,
                        ),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 28.dp)
                .alpha(enter.value),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.padding(top = 56.dp)) {
                Text(
                    "Shoker",
                    style = MaterialTheme.typography.displayLarge.copy(
                        fontSize = 64.sp,
                        lineHeight = 68.sp,
                        letterSpacing = 1.sp,
                    ),
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    "Poker shotów. Ty trzymasz stół,\nreszta wchodzi z przeglądarki.",
                    style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 26.sp),
                    color = ShokerColors.ivoryMute,
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 28.dp),
            ) {
                if (state.hotspotHintVisible) {
                    Text(
                        "Włącz hotspot, zanim utworzysz stół.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = ShokerColors.brassDim,
                    )
                    TextButton(
                        onClick = onHotspot,
                        modifier = Modifier.padding(top = 2.dp, bottom = 18.dp),
                    ) {
                        Text("Ustawienia hotspotu", color = ShokerColors.brass)
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(ShokerColors.brass),
                ) {
                    BrassButton(
                        text = if (state.serverState == HostRuntime.State.Running) {
                            "Wróć do stołu"
                        } else {
                            "Utwórz stół"
                        },
                        onClick = {
                            if (state.serverState == HostRuntime.State.Running) {
                                onResumeTable()
                            } else {
                                onCreate()
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(58.dp),
                    )
                }

                Spacer(Modifier.height(10.dp))

                TextButton(
                    onClick = onInstructions,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    Text(
                        "Jak to działa",
                        color = ShokerColors.ivory,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }

                if (state.error != null) {
                    Text(
                        state.error,
                        color = ShokerColors.ember,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
                if (state.message != null) {
                    Text(
                        state.message,
                        color = ShokerColors.brass,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }

                Text(
                    "Do 8 graczy, tylko sieć lokalna",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ShokerColors.mist,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 22.dp),
                )
            }
        }
    }
}
