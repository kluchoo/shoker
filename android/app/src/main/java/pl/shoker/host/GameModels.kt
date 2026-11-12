package pl.shoker.host

data class GameSettings(
    val entry: Double = 1.0,
    val allIn: Double = 3.0,
    val chambers: Int = 5,
    val soplica: Int = 5,
)

data class GamePlayer(
    val id: String,
    val nick: String,
    val connected: Boolean,
    val status: String,
    val inHand: Boolean,
    val dealer: Boolean,
    val turn: Boolean,
    val winner: Boolean,
    val owed: Double,
    val stake: Double,
)

data class HostCapabilities(
    val start: Boolean = false,
    val reveal: Boolean = false,
    val pick: Boolean = false,
    val next: Boolean = false,
    val skip: Boolean = false,
    val settings: Boolean = false,
    val reorder: Boolean = false,
)

data class AlivePlayer(
    val id: String,
    val nick: String,
)

data class GameState(
    val phase: String = "lobby",
    val streetName: String = "",
    val handNumber: Int = 0,
    val prompt: String? = null,
    val settings: GameSettings = GameSettings(),
    val players: List<GamePlayer> = emptyList(),
    val alive: List<AlivePlayer> = emptyList(),
    val host: HostCapabilities = HostCapabilities(),
    val isHost: Boolean = false,
    val log: List<String> = emptyList(),
)
