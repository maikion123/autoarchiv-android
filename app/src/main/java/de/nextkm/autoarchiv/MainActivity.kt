package de.nextkm.autoarchiv

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import de.nextkm.autoarchiv.api.ApiClient
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var apiClient: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        apiClient = ApiClient(this)

        // Check session and route accordingly
        lifecycleScope.launch {
            val hasValidSession = apiClient.checkSession()
            if (hasValidSession) {
                // Go to scanner
                startActivity(Intent(this@MainActivity, ScanActivity::class.java))
            } else {
                // Go to login
                startActivity(Intent(this@MainActivity, LoginActivity::class.java))
            }
            finish()
        }
    }
}
