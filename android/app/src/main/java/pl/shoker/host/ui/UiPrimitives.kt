package pl.shoker.host.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun SectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.bodyMedium.copy(
            fontSize = 12.sp,
            letterSpacing = 1.6.sp,
            fontWeight = FontWeight.Medium,
        ),
        color = ShokerColors.muted,
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
