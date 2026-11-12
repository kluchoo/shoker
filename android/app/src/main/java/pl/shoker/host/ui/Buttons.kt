package pl.shoker.host.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

private val ButtonShape = RoundedCornerShape(16.dp)

@Composable
fun BrassButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    // Matches web .btn.solid — bright fill, dark label
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(54.dp),
        shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = ShokerColors.text,
            contentColor = Color(0xFF111318),
            disabledContainerColor = ShokerColors.chip,
            disabledContentColor = ShokerColors.muted.copy(alpha = 0.5f),
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
        shape = ButtonShape,
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = ShokerColors.text,
            disabledContentColor = ShokerColors.muted.copy(alpha = 0.45f),
        ),
        border = BorderStroke(
            1.dp,
            if (enabled) ShokerColors.line else ShokerColors.muted.copy(alpha = 0.2f),
        ),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
    }
}
