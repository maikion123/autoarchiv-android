package de.nextkm.autoarchiv

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import de.nextkm.autoarchiv.api.ApiClient
import de.nextkm.autoarchiv.api.UploadResult
import de.nextkm.autoarchiv.databinding.ActivityScanBinding
import kotlinx.coroutines.launch

class ScanActivity : AppCompatActivity() {
    private lateinit var binding: ActivityScanBinding
    private lateinit var apiClient: ApiClient
    private val SCAN_REQUEST_CODE = 100

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityScanBinding.inflate(layoutInflater)
        setContentView(binding.root)

        apiClient = ApiClient(this)

        binding.scanButton.setOnClickListener {
            openDocumentScanner()
        }
    }

    private fun openDocumentScanner() {
        val options = com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setPageLimit(10)
            .setResultFormats(
                com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG,
                com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_PDF
            )
            .setScannerMode(com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(this)
            .addOnSuccessListener { intentSender: IntentSender ->
                startIntentSenderForResult(intentSender, SCAN_REQUEST_CODE, null, 0, 0, 0)
            }
            .addOnFailureListener { e ->
                Toast.makeText(this, "Scanner konnte nicht geöffnet werden: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == SCAN_REQUEST_CODE && resultCode == Activity.RESULT_OK) {
            val result = GmsDocumentScanningResult.fromActivityResultIntent(data)
            if (result != null) {
                // Upload pages
                uploadScannedImages(result)
            }
        }
    }

    private fun uploadScannedImages(result: GmsDocumentScanningResult) {
        binding.scanButton.isEnabled = false
        binding.scanButton.text = "Werden hochgeladen..."

        lifecycleScope.launch {
            try {
                val pages = result.pages
                if (pages.isNullOrEmpty()) {
                    Toast.makeText(this@ScanActivity, "Keine Seiten gescannt", Toast.LENGTH_SHORT).show()
                    resetButton()
                    return@launch
                }

                var uploadedCount = 0
                for ((index, page) in pages.withIndex()) {
                    val uri = page.imageUri
                    val bytes = contentResolver.openInputStream(uri)?.readBytes()

                    if (bytes != null) {
                        val filename = "scan_${System.currentTimeMillis()}_$index.jpg"
                        when (apiClient.uploadDocument(bytes, filename)) {
                            is UploadResult.Success -> {
                                uploadedCount++
                            }
                            is UploadResult.Error -> {
                                Toast.makeText(
                                    this@ScanActivity,
                                    "Upload fehlgeschlagen",
                                    Toast.LENGTH_LONG
                                ).show()
                                resetButton()
                                return@launch
                            }
                        }
                    }
                }

                if (uploadedCount == pages!!.size) {
                    Toast.makeText(
                        this@ScanActivity,
                        "$uploadedCount Dokument(e) hochgeladen!",
                        Toast.LENGTH_LONG
                    ).show()
                    resetButton()
                } else {
                    Toast.makeText(
                        this@ScanActivity,
                        "Nur $uploadedCount von ${pages!!.size} hochgeladen",
                        Toast.LENGTH_LONG
                    ).show()
                    resetButton()
                }
            } catch (e: Exception) {
                Toast.makeText(this@ScanActivity, "Fehler: ${e.message}", Toast.LENGTH_LONG).show()
                resetButton()
            }
        }
    }

    private fun resetButton() {
        binding.scanButton.isEnabled = true
        binding.scanButton.text = "Dokument scannen"
    }
}
