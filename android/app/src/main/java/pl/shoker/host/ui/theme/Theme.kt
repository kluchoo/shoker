package pl.shoker.host.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Mirrors the web client tokens from public/style.css:
 * --bg #090a0d, --accent #f4c56a, --text #f5f7fa, --muted #9aa3b2, --danger #ff5d4a
 */
object ShokerColors {
    val bg = Color(0xFF090A0D)
    val panel = Color(0xC7101218)
    val panelSolid = Color(0xFF12141C)
    val line = Color(0x1AFFFFFF)
    val text = Color(0xFFF5F7FA)
    val muted = Color(0xFF9AA3B2)
    val accent = Color(0xFFF4C56A)
    val accentDim = Color(0xFFB8924A)
    val danger = Color(0xFFFF5D4A)
    val paper = Color(0xFFEFE4CB)
    val chip = Color(0xFF1A1D26)
    val lift = Color(0xFF1C202B)

    // Back-compat aliases used across screens
    val feltDeep = bg
    val felt = panelSolid
    val feltLift = lift
    val brass = accent
    val brassDim = accentDim
    val ivory = text
    val ivoryMute = muted
    val ember = danger
    val mist = muted
}

private val colors = darkColorScheme(
    primary = ShokerColors.accent,
    onPrimary = Color(0xFF111318),
    secondary = ShokerColors.text,
    onSecondary = Color(0xFF111318),
    background = ShokerColors.bg,
    onBackground = ShokerColors.text,
    surface = ShokerColors.panelSolid,
    onSurface = ShokerColors.text,
    error = ShokerColors.danger,
    onError = ShokerColors.text,
    outline = ShokerColors.line,
)

private val typography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 64.sp,
        lineHeight = 58.sp,
        letterSpacing = (-2.5).sp,
        color = ShokerColors.text,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        letterSpacing = (-0.8).sp,
        color = ShokerColors.text,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        letterSpacing = (-0.3).sp,
        color = ShokerColors.text,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        color = ShokerColors.text,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        color = ShokerColors.text,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
        color = ShokerColors.muted,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        letterSpacing = (-0.2).sp,
    ),
)

@Composable
fun ShokerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = colors,
        typography = typography,
        content = content,
    )
}
