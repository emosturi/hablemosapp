package com.hablemos.recordatorios

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/**
 * Worker que consulta recordatorios pendientes en Supabase (misma BD que la web)
 * y muestra una notificación nativa en el teléfono por cada uno, sin usar Telegram ni WhatsApp.
 * Marca enviado = true en la BD para no duplicar con el envío por Telegram (Netlify).
 */
class ReminderWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = Prefs(applicationContext)
        val token = prefs.accessToken
        if (token.isNullOrBlank()) {
            return@withContext Result.success()
        }
        val url = prefs.supabaseUrl.trim().trimEnd('/')
        val key = prefs.supabaseAnonKey
        if (url.isBlank() || key.isBlank()) {
            return@withContext Result.success()
        }

        val (hoy, ahoraHhMm) = horaChile()
        val client = OkHttpClient.Builder().build()

        val listUrl = "$url/rest/v1/recordatorios?fecha=eq.$hoy&enviado=eq.false" +
            "&select=id,fecha,hora,mensaje,cliente_nombre,cliente_telefono"
        val listReq = Request.Builder()
            .url(listUrl)
            .addHeader("apikey", key)
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .get()
            .build()
        val listRes = client.newCall(listReq).execute()
        if (!listRes.isSuccessful) {
            return@withContext Result.retry()
        }
        val body = listRes.body?.string() ?: "[]"
        val arr = try { JSONArray(body) } catch (_: Exception) { JSONArray() }
        var notifId = NOTIFICATION_BASE_ID
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            val horaRec = r.optString("hora", "").trim()
            if (horaRec.isNotEmpty()) {
                val parts = horaRec.split(":")
                val rNorm = (parts.getOrNull(0) ?: "0").padStart(2, '0') + ":" +
                    (parts.getOrNull(1) ?: "0").padStart(2, '0')
                if (rNorm > ahoraHhMm) continue
            }
            val clienteNombre = r.optString("cliente_nombre", "")
            val clienteTel = r.optString("cliente_telefono", "")
            val cabecera = mutableListOf<String>()
            if (clienteNombre.isNotEmpty()) cabecera.add(clienteNombre)
            if (clienteTel.isNotEmpty()) cabecera.add("Tel: $clienteTel")
            val cabeceraStr = if (cabecera.isNotEmpty()) " (${cabecera.joinToString(", ")})" else ""
            val titulo = "Recordatorio$cabeceraStr"
            val texto = (if (horaRec.isNotEmpty()) "Para hoy a las $horaRec. " else "") +
                r.optString("mensaje", "")
            showNativeNotification(applicationContext, notifId, titulo, texto)
            val id = r.getString("id")
            patchEnviado(client, url, key, token, id)
            notifId++
        }
        Result.success()
    }

    private fun horaChile(): Pair<String, String> {
        val tz = TimeZone.getTimeZone("America/Santiago")
        val cal = java.util.Calendar.getInstance(tz)
        val y = cal.get(java.util.Calendar.YEAR)
        val m = (cal.get(java.util.Calendar.MONTH) + 1).toString().padStart(2, '0')
        val d = cal.get(java.util.Calendar.DAY_OF_MONTH).toString().padStart(2, '0')
        val hora = cal.get(java.util.Calendar.HOUR_OF_DAY).toString().padStart(2, '0')
        val min = cal.get(java.util.Calendar.MINUTE).toString().padStart(2, '0')
        return "$y-$m-$d" to "$hora:$min"
    }

    private fun showNativeNotification(context: Context, id: Int, title: String, text: String) {
        createChannel(context)
        val intent = Intent(context, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        val pending = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(id, notification)
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = context.getString(R.string.channel_description) }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun patchEnviado(client: OkHttpClient, baseUrl: String, key: String, token: String, id: String) {
        val url = "$baseUrl/rest/v1/recordatorios?id=eq.$id"
        val body = JSONObject().apply { put("enviado", true) }.toString()
        val req = Request.Builder()
            .url(url)
            .addHeader("apikey", key)
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal")
            .patch(body.toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute()
    }

    companion object {
        const val WORK_NAME = "recordatorios_send"
        private const val CHANNEL_ID = "recordatorios_hablemos"
        private const val NOTIFICATION_BASE_ID = 1000
    }
}
