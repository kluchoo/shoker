package pl.shoker.host.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

private val ChipShape = RoundedCornerShape(14.dp)

@Composable
fun StepperRow(
    label: String,
    value: String,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    enabled: Boolean,
    minusEnabled: Boolean = enabled,
    plusEnabled: Boolean = enabled,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clip(ChipShape)
            .background(Color.White.copy(alpha = 0.03f))
            .border(1.dp, ShokerColors.line, ChipShape)
            .padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onMinus, enabled = enabled && minusEnabled) {
            Text(
                "−",
                color = if (enabled && minusEnabled) ShokerColors.text else ShokerColors.muted,
                style = MaterialTheme.typography.titleLarge,
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(value, style = MaterialTheme.typography.titleMedium, color = ShokerColors.text)
        }
        TextButton(onClick = onPlus, enabled = enabled && plusEnabled) {
            Text(
                "+",
                color = if (enabled && plusEnabled) ShokerColors.text else ShokerColors.muted,
                style = MaterialTheme.typography.titleLarge,
            )
        }
    }
}
