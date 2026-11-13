package pl.shoker.host.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun ShareBlock(
    preferredUrl: String?,
    fallbackUrl: String?,
    joinUrl: String?,
    qr: Bitmap?,
    qrUsesFallback: Boolean,
    mdnsNote: String?,
    portNote: String?,
    hotspotHint: Boolean,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onToggleQr: () -> Unit,
    onHotspot: () -> Unit,
    onRefresh: () -> Unit,
) {
    val canToggle = !preferredUrl.isNullOrBlank() && !fallbackUrl.isNullOrBlank() && preferredUrl != fallbackUrl
    FeltPanel {
        SectionLabel("Udostępnij stół")
        SectionLabel(if (canToggle) "Adres" else "Adres dołączenia")
        Text(
            preferredUrl ?: "Szukam adresu w sieci…",
            style = MaterialTheme.typography.titleMedium,
            color = ShokerColors.text,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = if (fallbackUrl == null) 12.dp else 4.dp),
        )
        if (fallbackUrl != null) {
            SectionLabel("Awaryjnie")
            Text(
                fallbackUrl,
                style = MaterialTheme.typography.bodyLarge,
                color = ShokerColors.muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            )
        }
        if (!mdnsNote.isNullOrBlank()) {
            Text(
                mdnsNote,
                style = MaterialTheme.typography.bodyMedium,
                color = ShokerColors.accentDim,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            )
        }
        if (!portNote.isNullOrBlank()) {
            Text(
                portNote,
                style = MaterialTheme.typography.bodyMedium,
                color = ShokerColors.danger,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            )
        }
        if (qr != null) {
            Box(
                modifier = Modifier
                    .size(236.dp)
                    .align(Alignment.CenterHorizontally)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White)
                    .border(1.dp, ShokerColors.line, RoundedCornerShape(20.dp))
                    .padding(8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    bitmap = qr.asImageBitmap(),
                    contentDescription = "Kod QR stołu",
                    modifier = Modifier.size(220.dp),
                )
            }
            Text(
                if (qrUsesFallback || !canToggle) "Kod QR prowadzi do adresu IP" else "Kod QR prowadzi do domeny",
                style = MaterialTheme.typography.bodyMedium,
                color = ShokerColors.muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
            )
            VerticalSpace(8)
        }
        BrassButton(text = "Wyślij adres", onClick = onShare, enabled = joinUrl != null)
        VerticalSpace(8)
        GhostButton(text = "Kopiuj adres", onClick = onCopy, enabled = joinUrl != null)
        if (canToggle) {
            TextButton(
                onClick = onToggleQr,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    if (qrUsesFallback) "QR z domeną" else "QR z adresem IP",
                    color = ShokerColors.accent,
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = onRefresh) {
                Text("Odśwież IP", color = ShokerColors.accent)
            }
            if (hotspotHint) {
                TextButton(onClick = onHotspot) {
                    Text("Hotspot", color = ShokerColors.accent)
                }
            }
        }
    }
}
