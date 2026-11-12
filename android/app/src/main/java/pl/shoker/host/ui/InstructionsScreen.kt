package pl.shoker.host.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun InstructionsScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ShokerColors.feltDeep)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 20.dp),
    ) {
        TextButton(onClick = onBack) {
            Text("← Wróć", color = ShokerColors.brass)
        }
        Text("Jak grać", style = MaterialTheme.typography.headlineMedium, color = ShokerColors.brass)
        Text(
            "Karty rozdajecie fizycznie. Telefon prowadzi kolejkę, stawki w kieliszkach i ruletkę wypicia.",
            style = MaterialTheme.typography.bodyLarge,
            color = ShokerColors.ivoryMute,
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
        )

        InstructionBlock(
            title = "Przygotowanie",
            lines = listOf(
                "Włącz hotspot na tym telefonie.",
                "Wyłącz izolację klientów AP, jeśli producent ma taką opcję.",
                "Utwórz stół w aplikacji i pokaż QR albo wyślij link.",
            ),
        )
        VerticalSpace(14)
        InstructionBlock(
            title = "Dołączenie",
            lines = listOf(
                "Goście łączą się z Twoim hotspotem.",
                "Otwierają adres w przeglądarce i podają nick.",
                "Ty zostajesz hostem gry w aplikacji — nie muszą nic instalować.",
            ),
        )
        VerticalSpace(14)
        InstructionBlock(
            title = "Rozdanie",
            lines = listOf(
                "Ustaw wejście, all-in, komory i Soplicę.",
                "Gdy są co najmniej 2 osoby, naciśnij Start.",
                "Po okrążeniu odkrywasz karty. Na showdown wskazujesz zwycięzcę.",
                "Przegrani z stawką kręcą ruletkę — ryzyko rośnie z ulicą.",
            ),
        )
        VerticalSpace(24)
        Text(
            "Pijcie odpowiedzialnie. Gra dla osób pełnoletnich.",
            style = MaterialTheme.typography.bodyMedium,
            color = ShokerColors.mist,
        )
    }
}

@Composable
private fun InstructionBlock(title: String, lines: List<String>) {
    FeltPanel {
        Text(title, style = MaterialTheme.typography.titleMedium, color = ShokerColors.brass)
        lines.forEachIndexed { index, line ->
            Text(
                "${index + 1}. $line",
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
}
