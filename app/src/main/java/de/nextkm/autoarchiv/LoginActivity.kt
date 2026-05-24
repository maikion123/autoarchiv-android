package de.nextkm.autoarchiv

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import de.nextkm.autoarchiv.api.ApiClient
import de.nextkm.autoarchiv.api.LoginResult
import de.nextkm.autoarchiv.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var apiClient: ApiClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        apiClient = ApiClient(this)

        binding.loginButton.setOnClickListener {
            val email = binding.emailInput.text.toString().trim()
            val password = binding.passwordInput.text.toString().trim()

            if (email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "E-Mail und Passwort erforderlich", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            binding.loginButton.isEnabled = false
            binding.loginButton.text = "Wird angemeldet..."

            lifecycleScope.launch {
                when (val result = apiClient.login(email, password)) {
                    is LoginResult.Success -> {
                        // Login successful, go to scanner
                        startActivity(Intent(this@LoginActivity, ScanActivity::class.java))
                        finish()
                    }
                    is LoginResult.Error -> {
                        Toast.makeText(
                            this@LoginActivity,
                            result.message,
                            Toast.LENGTH_LONG
                        ).show()
                        binding.loginButton.isEnabled = true
                        binding.loginButton.text = "Anmelden"
                    }
                }
            }
        }
    }
}
