package pl.shoker.host.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun StatusPill(text: String, active: Boolean) {
    val bg = if (active) ShokerColors.accent.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.04f)
    val fg = if (active) ShokerColors.accent else ShokerColors.muted
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.28f), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(text, color = fg, style = MaterialTheme.typography.bodyMedium)
    }
}
