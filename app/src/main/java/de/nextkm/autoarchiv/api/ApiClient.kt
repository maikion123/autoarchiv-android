package de.nextkm.autoarchiv.api

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.HttpCookie

class ApiClient(private val context: Context) {
    private val client = OkHttpClient()
    private val baseUrl = "https://nextkm.de"
    private val prefsName = "autoarchiv_prefs"

    suspend fun login(email: String, password: String): LoginResult = withContext(Dispatchers.IO) {
        try {
            val json = """{"email":"$email","password":"$password"}"""
            val body = json.toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url("$baseUrl/api/auth/login")
                .post(body)
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                // Extract and store cookie
                val cookieHeader = response.header("Set-Cookie")
                if (cookieHeader != null) {
                    saveCookie(cookieHeader)
                }
                LoginResult.Success
            } else {
                LoginResult.Error("Login fehlgeschlagen: ${response.code}")
            }
        } catch (e: Exception) {
            LoginResult.Error("Fehler: ${e.message}")
        }
    }

    suspend fun checkSession(): Boolean = withContext(Dispatchers.IO) {
        try {
            val cookie = getCookie()
            if (cookie.isEmpty()) return@withContext false

            val request = Request.Builder()
                .url("$baseUrl/api/auth/me")
                .header("Cookie", cookie)
                .build()

            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: Exception) {
            false
        }
    }

    suspend fun uploadDocument(bytes: ByteArray, filename: String): UploadResult = withContext(Dispatchers.IO) {
        try {
            val cookie = getCookie()
            if (cookie.isEmpty()) return@withContext UploadResult.Error("Keine Session")

            val body = bytes.toRequestBody("application/octet-stream".toMediaType())
            val url = "$baseUrl/api/documents/upload?filename=$filename&mimeType=image/jpeg"

            val request = Request.Builder()
                .url(url)
                .post(body)
                .header("Cookie", cookie)
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                UploadResult.Success
            } else {
                UploadResult.Error("Upload fehlgeschlagen: ${response.code}")
            }
        } catch (e: Exception) {
            UploadResult.Error("Fehler: ${e.message}")
        }
    }

    private fun saveCookie(cookieHeader: String) {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        // Extract just the auth_token value
        val token = cookieHeader.split(";").firstOrNull()?.trim() ?: cookieHeader
        prefs.edit().putString("session_cookie", token).apply()
    }

    private fun getCookie(): String {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        return prefs.getString("session_cookie", "") ?: ""
    }

    fun clearSession() {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit().remove("session_cookie").apply()
    }
}

sealed class LoginResult {
    object Success : LoginResult()
    data class Error(val message: String) : LoginResult()
}

sealed class UploadResult {
    object Success : UploadResult()
    data class Error(val message: String) : UploadResult()
}
