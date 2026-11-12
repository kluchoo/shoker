package pl.shoker.host.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

private val PanelShape = RoundedCornerShape(28.dp)

@Composable
fun FeltPanel(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(PanelShape)
            .background(ShokerColors.panelSolid.copy(alpha = 0.92f))
            .border(1.dp, ShokerColors.line, PanelShape)
            .padding(22.dp),
        content = content,
    )
}
