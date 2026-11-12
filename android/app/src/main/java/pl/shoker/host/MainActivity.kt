package pl.shoker.host

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import pl.shoker.host.ui.HostScreen
import pl.shoker.host.ui.theme.ShokerTheme

class MainActivity : ComponentActivity() {

    private val viewModel: HostViewModel by viewModels()

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* no-op — FGS still works; notification may be limited */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        maybeRequestNotifications()

        setContent {
            val state by viewModel.ui.collectAsState()
            ShokerTheme {
                HostScreen(
                    state = state,
                    onCreate = { viewModel.createTable() },
                    onEnd = { viewModel.endTable() },
                    onCopy = { viewModel.copyLink() },
                    onHotspot = { viewModel.openHotspotSettings() },
                    onPlayLocal = { viewModel.openLocalGame() },
                    onRefreshNetwork = { viewModel.refreshNetwork() },
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
