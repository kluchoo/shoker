package pl.shoker.host.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun FeltPanel(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(ShokerColors.felt)
            .border(1.dp, ShokerColors.brass.copy(alpha = 0.28f), RoundedCornerShape(4.dp))
            .padding(18.dp),
        content = content,
    )
}

@Composable
fun BrassButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(54.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = ShokerColors.brass,
            contentColor = ShokerColors.feltDeep,
            disabledContainerColor = ShokerColors.chip,
            disabledContentColor = ShokerColors.mist,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(54.dp),
        shape = RoundedCornerShape(4.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = ShokerColors.ivory,
            disabledContentColor = ShokerColors.mist,
        ),
        border = BorderStroke(1.dp, if (enabled) ShokerColors.brass.copy(alpha = 0.45f) else ShokerColors.mist.copy(alpha = 0.25f)),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

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
            .clip(RoundedCornerShape(4.dp))
            .background(ShokerColors.chip)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onMinus, enabled = enabled && minusEnabled) {
            Text(
                "−",
                color = if (enabled && minusEnabled) ShokerColors.brass else ShokerColors.mist,
                style = MaterialTheme.typography.titleLarge,
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(value, style = MaterialTheme.typography.titleMedium, color = ShokerColors.ivory)
        }
        TextButton(onClick = onPlus, enabled = enabled && plusEnabled) {
            Text(
                "+",
                color = if (enabled && plusEnabled) ShokerColors.brass else ShokerColors.mist,
                style = MaterialTheme.typography.titleLarge,
            )
        }
    }
}

@Composable
fun StatusPill(text: String, active: Boolean) {
    val bg = if (active) ShokerColors.brass.copy(alpha = 0.18f) else ShokerColors.chip
    val fg = if (active) ShokerColors.brass else ShokerColors.mist
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(text, color = fg, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun Avatar(letter: String) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(ShokerColors.feltLift)
            .border(1.dp, ShokerColors.brass.copy(alpha = 0.45f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            letter.uppercase().take(1),
            color = ShokerColors.brass,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = ShokerColors.brassDim,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
fun VerticalSpace(dp: Int = 16) {
    Spacer(Modifier.height(dp.dp))
}

@Composable
fun HorizontalSpace(dp: Int = 8) {
    Spacer(Modifier.width(dp.dp))
}
