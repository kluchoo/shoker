package pl.shoker.host.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import pl.shoker.host.GamePlayer
import pl.shoker.host.GameState
import pl.shoker.host.ui.theme.ShokerColors

@Composable
fun AdminPanel(
    game: GameState,
    serverRunning: Boolean,
    onStart: () -> Unit,
    onReveal: () -> Unit,
    onNext: () -> Unit,
    onSkip: () -> Unit,
    onKick: (String) -> Unit,
    onWinner: (String) -> Unit,
    onReorder: (String, Int) -> Unit,
    onBump: (String, Double) -> Unit,
    onSoplica: (Int) -> Unit,
) {
    FeltPanel {
        SectionLabel("Panel hosta")
        Text(
            "${game.players.size} przy stole" +
                if (game.players.isNotEmpty()) " · ${game.players.count { it.connected }} online" else "",
            style = MaterialTheme.typography.titleLarge,
            color = ShokerColors.text,
        )
        if (game.prompt != null) {
            Text(game.prompt, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
        }

        VerticalSpace(12)
        game.players.forEachIndexed { index, player ->
            PlayerRow(
                player = player,
                index = index,
                total = game.players.size,
                canReorder = game.host.reorder && serverRunning,
                onKick = { onKick(player.id) },
                onUp = { onReorder(player.id, -1) },
                onDown = { onReorder(player.id, 1) },
            )
        }
        if (game.players.isEmpty()) {
            Text(
                "Czekam, aż ktoś zeskanuje QR i poda nick.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        }

        VerticalSpace(12)
        SectionLabel("Stawki")
        val settingsEnabled = game.host.settings && serverRunning
        val entry = game.settings.entry
        val allIn = game.settings.allIn
        val minAllIn = kotlin.math.round(entry * 3 * 2) / 2.0
        StepperRow(
            label = "Wejście",
            value = formatDrinks(entry),
            onMinus = { onBump("entry", -0.5) },
            onPlus = { onBump("entry", 0.5) },
            enabled = settingsEnabled,
            minusEnabled = entry > 0.5,
            plusEnabled = entry < 20.0,
        )
        StepperRow(
            label = "All-in (min ${formatDrinks(minAllIn)})",
            value = formatDrinks(allIn),
            onMinus = { onBump("allIn", -0.5) },
            onPlus = { onBump("allIn", 0.5) },
            enabled = settingsEnabled,
            minusEnabled = allIn > minAllIn,
            plusEnabled = allIn < 60.0,
        )
        StepperRow(
            label = "Komory",
            value = game.settings.chambers.toString(),
            onMinus = { onBump("chambers", -1.0) },
            onPlus = { onBump("chambers", 1.0) },
            enabled = settingsEnabled,
            minusEnabled = game.settings.chambers > 2,
            plusEnabled = game.settings.chambers < 12,
        )
        Text(
            "Soplica ${game.settings.soplica}%",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 8.dp),
        )
        Slider(
            value = game.settings.soplica.toFloat(),
            onValueChange = { onSoplica(it.toInt()) },
            valueRange = 0f..100f,
            enabled = settingsEnabled,
            colors = SliderDefaults.colors(
                thumbColor = ShokerColors.accent,
                activeTrackColor = ShokerColors.accent,
                inactiveTrackColor = ShokerColors.chip,
            ),
        )

        VerticalSpace(8)
        HostActions(
            game = game,
            serverRunning = serverRunning,
            onStart = onStart,
            onReveal = onReveal,
            onNext = onNext,
            onSkip = onSkip,
            onWinner = onWinner,
        )
    }
}

@Composable
private fun HostActions(
    game: GameState,
    serverRunning: Boolean,
    onStart: () -> Unit,
    onReveal: () -> Unit,
    onNext: () -> Unit,
    onSkip: () -> Unit,
    onWinner: (String) -> Unit,
) {
    when {
        !serverRunning -> Text("Serwer jeszcze się uruchamia…", style = MaterialTheme.typography.bodyMedium)
        game.host.reveal -> BrassButton(text = "Karty odkryte", onClick = onReveal)
        game.host.pick -> {
            SectionLabel("Wybierz zwycięzcę")
            game.alive.forEach { player ->
                GhostButton(
                    text = player.nick,
                    onClick = { onWinner(player.id) },
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
        }
        game.host.next -> BrassButton(text = "Nowe rozdanie", onClick = onNext)
        game.host.start -> BrassButton(text = "Start rozdania", onClick = onStart)
        game.host.skip -> GhostButton(text = "Pomiń kolejkę", onClick = onSkip)
        game.phase == "lobby" && game.players.size < 2 ->
            Text("Potrzeba co najmniej dwóch graczy.", style = MaterialTheme.typography.bodyMedium)
        game.phase == "betting" ->
            Text("Trwa kolejka graczy.", style = MaterialTheme.typography.bodyMedium)
        game.phase == "roulette" ->
            Text("Ruletka na stole…", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PlayerRow(
    player: GamePlayer,
    index: Int,
    total: Int,
    canReorder: Boolean,
    onKick: () -> Unit,
    onUp: () -> Unit,
    onDown: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(player.nick)
        Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(player.nick, style = MaterialTheme.typography.titleMedium, color = ShokerColors.text)
            val bits = buildList {
                add(if (player.connected) "online" else "offline")
                if (player.dealer) add("dealer")
                if (player.turn) add("tura")
                if (player.winner) add("wygrywa")
                if (player.stake > 0) add("stawka ${formatDrinks(player.stake)}")
                if (player.owed > 0) add("do wypicia ${formatDrinks(player.owed)}")
            }
            Text(bits.joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
        }
        Column(horizontalAlignment = Alignment.End) {
            Row {
                TextButton(onClick = onUp, enabled = canReorder && index > 0) {
                    Text("▲", color = ShokerColors.accent)
                }
                TextButton(onClick = onDown, enabled = canReorder && index < total - 1) {
                    Text("▼", color = ShokerColors.accent)
                }
            }
            TextButton(onClick = onKick) {
                Text("Wyrzuć", color = ShokerColors.danger)
            }
        }
    }
}
