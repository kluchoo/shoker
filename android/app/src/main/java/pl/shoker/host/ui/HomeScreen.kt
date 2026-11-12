package pl.shoker.host.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
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

    ScreenBackground {
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
                        lineHeight = 58.sp,
                        letterSpacing = (-2.5).sp,
                    ),
                    color = ShokerColors.text,
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    "Poker shotów. Ty trzymasz stół,\nreszta wchodzi z przeglądarki.",
                    style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 26.sp),
                    color = ShokerColors.muted,
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
                        color = ShokerColors.accentDim,
                    )
                    TextButton(
                        onClick = onHotspot,
                        modifier = Modifier.padding(top = 2.dp, bottom = 18.dp),
                    ) {
                        Text("Ustawienia hotspotu", color = ShokerColors.accent)
                    }
                }

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
                )

                Spacer(Modifier.height(10.dp))

                GhostButton(
                    text = "Jak to działa",
                    onClick = onInstructions,
                )

                if (state.error != null) {
                    Text(
                        state.error,
                        color = ShokerColors.danger,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
                if (state.message != null) {
                    Text(
                        state.message,
                        color = ShokerColors.accent,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }

                Text(
                    "Do 8 graczy, tylko sieć lokalna",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ShokerColors.muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 22.dp),
                )
            }
        }
    }
}
