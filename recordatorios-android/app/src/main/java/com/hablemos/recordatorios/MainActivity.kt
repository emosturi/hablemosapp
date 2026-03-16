package com.hablemos.recordatorios

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var container: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        }
        prefs = Prefs(this)
        container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        val scroll = ScrollView(this).apply { addView(container) }
        setContentView(scroll)
        if (prefs.accessToken.isNullOrBlank()) {
            showLogin()
        } else if (!prefs.isConfigured()) {
            showSettings("Configura Supabase para recibir notificaciones nativas de recordatorios.")
        } else {
            showMain()
        }
    }

    private fun dp(x: Int) = (x * resources.displayMetrics.density).toInt()

    private fun showLogin() {
        container.removeAllViews()
        val title = TextView(this).apply {
            text = "Iniciar sesión"
            textSize = 20f
            setPadding(0, 0, 0, dp(8))
        }
        val email = EditText(this).apply {
            hint = "Email"
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val password = EditText(this).apply {
            hint = "Contraseña"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val btnLogin = Button(this).apply {
            text = "Entrar"
            setOnClickListener {
                val u = prefs.supabaseUrl.ifBlank { null } ?: run {
                    Toast.makeText(this@MainActivity, "Configura primero la URL y la clave de Supabase (abre Ajustes).", Toast.LENGTH_LONG).show()
                    return@setOnClickListener
                }
                val key = prefs.supabaseAnonKey.ifBlank { null } ?: run {
                    Toast.makeText(this@MainActivity, "Falta la clave anon de Supabase.", Toast.LENGTH_LONG).show()
                    return@setOnClickListener
                }
                isEnabled = false
                CoroutineScope(Dispatchers.Main).launch {
                    val r = withContext(Dispatchers.IO) {
                        SupabaseAuth.login(u, key, email.text.toString().trim(), password.text.toString())
                    }
                    isEnabled = true
                    r.fold(
                        onSuccess = { token ->
                            prefs.accessToken = token
                            if (!prefs.isConfigured()) showSettings("Configura Supabase.")
                            else showMain()
                        },
                        onFailure = { e ->
                            Toast.makeText(this@MainActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                    )
                }
            }
        }
        val btnSettings = Button(this).apply {
            text = "Ajustes (Supabase URL y clave)"
            setOnClickListener { showSettingsFromMain() }
        }
        container.addView(title)
        container.addView(email)
        container.addView(password)
        container.addView(btnLogin)
        container.addView(btnSettings)
    }

    private fun showMain() {
        container.removeAllViews()
        val status = TextView(this).apply {
            text = "Sesión iniciada. Recibirás notificaciones nativas en el teléfono cada 15 min (zona Chile) para los recordatorios programados. Es una redundancia al envío por Telegram."
            setPadding(0, 0, 0, dp(16))
        }
        val btnNow = Button(this).apply {
            text = "Comprobar recordatorios ahora"
            setOnClickListener {
                val work = OneTimeWorkRequestBuilder<ReminderWorker>().build()
                WorkManager.getInstance(this@MainActivity).enqueueUniqueWork(
                    ReminderWorker.WORK_NAME + "_once",
                    ExistingWorkPolicy.REPLACE,
                    work
                )
                Toast.makeText(this@MainActivity, "Comprobando…", Toast.LENGTH_SHORT).show()
            }
        }
        val btnSettings = Button(this).apply {
            text = "Ajustes (Supabase)"
            setOnClickListener { showSettingsFromMain() }
        }
        val btnLogout = Button(this).apply {
            text = "Cerrar sesión"
            setOnClickListener {
                prefs.clearSession()
                showLogin()
            }
        }
        container.addView(status)
        container.addView(btnNow)
        container.addView(btnSettings)
        container.addView(btnLogout)
    }

    private fun showSettingsFromMain() {
        showSettings(null)
    }

    private fun showSettings(message: String?) {
        container.removeAllViews()
        if (!message.isNullOrBlank()) {
            container.addView(TextView(this).apply {
                text = message
                setPadding(0, 0, 0, dp(8))
            })
        }
        val edUrl = EditText(this).apply {
            hint = "Supabase URL (ej. https://xxx.supabase.co)"
            setText(prefs.supabaseUrl)
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val edKey = EditText(this).apply {
            hint = "Supabase anon key"
            setText(prefs.supabaseAnonKey)
            inputType = android.text.InputType.TYPE_CLASS_TEXT
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val btnSave = Button(this).apply {
            text = "Guardar y continuar"
            setOnClickListener {
                prefs.supabaseUrl = edUrl.text.toString().trim()
                prefs.supabaseAnonKey = edKey.text.toString().trim()
                Toast.makeText(this@MainActivity, "Guardado.", Toast.LENGTH_SHORT).show()
                if (prefs.accessToken.isNullOrBlank()) showLogin() else showMain()
            }
        }
        val btnBack = Button(this).apply {
            text = "Volver"
            setOnClickListener {
                if (prefs.accessToken.isNullOrBlank()) showLogin() else showMain()
            }
        }
        container.addView(edUrl)
        container.addView(edKey)
        container.addView(btnSave)
        container.addView(btnBack)
    }
}
