package pl.shoker.host

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.collectLatest
import pl.shoker.host.ui.ShokerAppNav
import pl.shoker.host.ui.theme.ShokerTheme

class MainActivity : ComponentActivity() {

    private val viewModel: HostViewModel by viewModels()

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* FGS still works; notification may be limited */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        maybeRequestNotifications()

        setContent {
            val state by viewModel.ui.collectAsState()
            LaunchedEffect(Unit) {
                viewModel.shareRequests.collectLatest { url ->
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "Shoker — dołącz do stołu")
                        putExtra(Intent.EXTRA_TEXT, "Wejdź do Shokera:\n$url")
                    }
                    startActivity(Intent.createChooser(send, "Udostępnij stół"))
                }
            }
            ShokerTheme {
                ShokerAppNav(
                    state = state,
                    onCreate = { viewModel.createTable() },
                    onInstructions = { viewModel.openInstructions() },
                    onResumeTable = { viewModel.openTableScreen() },
                    onBackHome = { viewModel.goHome() },
                    onCancelBoot = { viewModel.cancelBoot() },
                    onEnd = { viewModel.endTable() },
                    onCopy = { viewModel.copyLink() },
                    onShare = { viewModel.shareLink() },
                    onHotspot = { viewModel.openHotspotSettings() },
                    onRefreshNetwork = { viewModel.refreshNetwork() },
                    onPlayLocal = { viewModel.openLocalGame() },
                    onStart = { viewModel.startHand() },
                    onReveal = { viewModel.reveal() },
                    onNext = { viewModel.nextHand() },
                    onSkip = { viewModel.skipTurn() },
                    onKick = { viewModel.kick(it) },
                    onWinner = { viewModel.pickWinner(it) },
                    onReorder = { id, dir -> viewModel.reorder(id, dir) },
                    onBump = { field, delta -> viewModel.bumpSetting(field, delta) },
                    onSoplica = { viewModel.setSoplica(it) },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        viewModel.refreshNetwork()
    }

    private fun maybeRequestNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
