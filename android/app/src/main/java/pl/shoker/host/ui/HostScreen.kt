package pl.shoker.host.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.shoker.host.HostRuntime
import pl.shoker.host.HostUiState
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun HostScreen(
    state: HostUiState,
    onCreate: () -> Unit,
    onEnd: () -> Unit,
    onCopy: () -> Unit,
    onHotspot: () -> Unit,
    onPlayLocal: () -> Unit,
    onRefreshNetwork: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ShokerColors.ink)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "SHOKER",
            color = ShokerColors.gold,
            fontSize = 40.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 4.sp,
            fontFamily = FontFamily.Serif,
        )
        Text(
            text = "Poker shotów w sieci lokalnej",
            color = ShokerColors.cream.copy(alpha = 0.75f),
            fontSize = 14.sp,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
        )

        StatusChip(state)

        Spacer(Modifier.height(20.dp))

        if (state.hotspotHintVisible) {
            HintCard(
                title = "Włącz hotspot",
                body = "Uczestnicy muszą połączyć się z hotspotem tego telefonu. Android nie pozwala aplikacji włączyć go automatycznie. Wyłącz izolację klientów AP, jeśli jest dostępna.",
                actionLabel = "Ustawienia hotspotu",
                onAction = onHotspot,
            )
            Spacer(Modifier.height(16.dp))
        }

        AddressBlock(state, onCopy, onRefreshNetwork)

        Spacer(Modifier.height(16.dp))

        QrBlock(state.qr)

        Spacer(Modifier.height(16.dp))

        Text(
            text = "Gracze przy stole: ${state.playerCount}" +
                if (state.connectedCount > 0) "  ·  online: ${state.connectedCount}" else "",
            color = ShokerColors.cream,
            fontSize = 16.sp,
        )
        if (state.phase != null) {
            Text(
                text = "Faza: ${state.phase}",
                color = ShokerColors.cream.copy(alpha = 0.7f),
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (state.error != null) {
            Text(
                text = state.error,
                color = ShokerColors.danger,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
        if (state.message != null) {
            Text(
                text = state.message,
                color = ShokerColors.ok,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Spacer(Modifier.height(28.dp))

        Button(
            onClick = onCreate,
            enabled = state.serverState == HostRuntime.State.Stopped || state.serverState == HostRuntime.State.Error,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = ShokerColors.gold,
                contentColor = ShokerColors.ink,
            ),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text("Utwórz stół", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }

        Spacer(Modifier.height(10.dp))

        OutlinedButton(
            onClick = onEnd,
            enabled = state.serverState == HostRuntime.State.Running || state.serverState == HostRuntime.State.Starting,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = ShokerColors.cream),
        ) {
            Text("Zakończ stół", fontSize = 16.sp)
        }

        if (state.serverState == HostRuntime.State.Running) {
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onPlayLocal) {
                Text("Graj na tym telefonie", color = ShokerColors.gold)
            }
        }

        Spacer(Modifier.height(20.dp))
        Text(
            text = "Pozostali gracze dołączają tylko przez przeglądarkę — bez instalacji APK.",
            color = ShokerColors.cream.copy(alpha = 0.55f),
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun StatusChip(state: HostUiState) {
    val color = when (state.serverState) {
        HostRuntime.State.Running -> ShokerColors.ok
        HostRuntime.State.Starting -> ShokerColors.gold
        HostRuntime.State.Error -> ShokerColors.danger
        HostRuntime.State.Stopped -> ShokerColors.cream.copy(alpha = 0.5f)
    }
    Text(
        text = "Status: ${state.statusText}",
        color = color,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
    )
}

@Composable
private fun HintCard(
    title: String,
    body: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(ShokerColors.panel, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Text(title, color = ShokerColors.gold, fontWeight = FontWeight.SemiBold)
        Text(
            body,
            color = ShokerColors.cream.copy(alpha = 0.8f),
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
        TextButton(onClick = onAction, modifier = Modifier.padding(top = 4.dp)) {
            Text(actionLabel, color = ShokerColors.gold)
        }
    }
}

@Composable
private fun AddressBlock(
    state: HostUiState,
    onCopy: () -> Unit,
    onRefreshNetwork: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(ShokerColors.panel, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Adres stołu", color = ShokerColors.cream.copy(alpha = 0.7f), fontSize = 12.sp)
        Text(
            text = state.joinUrl ?: "Brak adresu IP — włącz hotspot",
            color = ShokerColors.cream,
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(top = 8.dp),
        ) {
            TextButton(onClick = onCopy, enabled = state.joinUrl != null) {
                Text("Kopiuj link", color = ShokerColors.gold)
            }
            TextButton(onClick = onRefreshNetwork) {
                Text("Odśwież IP", color = ShokerColors.gold)
            }
        }
    }
}

@Composable
private fun QrBlock(qr: Bitmap?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(ShokerColors.panel, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Kod QR", color = ShokerColors.cream.copy(alpha = 0.7f), fontSize = 12.sp)
        Spacer(Modifier.height(12.dp))
        if (qr != null) {
            Image(
                bitmap = qr.asImageBitmap(),
                contentDescription = "QR dołączenia",
                modifier = Modifier.size(220.dp),
            )
        } else {
            Text(
                "QR pojawi się po wykryciu adresu IP",
                color = ShokerColors.cream.copy(alpha = 0.5f),
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
