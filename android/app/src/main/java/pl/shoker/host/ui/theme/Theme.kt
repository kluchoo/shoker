package pl.shoker.host.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Cream = Color(0xFFF6EDD9)
private val Gold = Color(0xFFE6C98A)
private val Ink = Color(0xFF140C09)
private val Panel = Color(0xFF1E1511)
private val Danger = Color(0xFFC45C4A)
private val Ok = Color(0xFF6FAE7A)

private val colors = darkColorScheme(
    primary = Gold,
    onPrimary = Ink,
    secondary = Cream,
    onSecondary = Ink,
    background = Ink,
    onBackground = Cream,
    surface = Panel,
    onSurface = Cream,
    error = Danger,
    onError = Cream,
)

@Composable
fun ShokerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = colors,
        content = content,
    )
}

object ShokerColors {
    val cream = Cream
    val gold = Gold
    val ink = Ink
    val panel = Panel
    val danger = Danger
    val ok = Ok
}
