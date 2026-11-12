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

object ShokerColors {
    val feltDeep = Color(0xFF0C1612)
    val felt = Color(0xFF163528)
    val feltLift = Color(0xFF1F4636)
    val brass = Color(0xFFD4B56A)
    val brassDim = Color(0xFF9A8248)
    val ivory = Color(0xFFEFE6D4)
    val ivoryMute = Color(0xFFB9B09C)
    val ember = Color(0xFFB84A3A)
    val mist = Color(0xFF8FA394)
    val chip = Color(0xFF243F33)
}

private val colors = darkColorScheme(
    primary = ShokerColors.brass,
    onPrimary = ShokerColors.feltDeep,
    secondary = ShokerColors.ivory,
    onSecondary = ShokerColors.feltDeep,
    background = ShokerColors.feltDeep,
    onBackground = ShokerColors.ivory,
    surface = ShokerColors.felt,
    onSurface = ShokerColors.ivory,
    error = ShokerColors.ember,
    onError = ShokerColors.ivory,
)

private val typography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 52.sp,
        lineHeight = 56.sp,
        letterSpacing = 2.sp,
        color = ShokerColors.brass,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        color = ShokerColors.ivory,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        color = ShokerColors.ivory,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        color = ShokerColors.ivory,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        color = ShokerColors.ivory,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
        color = ShokerColors.ivoryMute,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
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
