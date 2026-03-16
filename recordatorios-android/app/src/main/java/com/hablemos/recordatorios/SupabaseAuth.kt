package com.hablemos.recordatorios

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object SupabaseAuth {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun login(url: String, anonKey: String, email: String, password: String): Result<String> {
        val base = url.trim().trimEnd('/')
        val json = JSONObject().apply {
            put("grant_type", "password")
            put("email", email)
            put("password", password)
        }
        val req = Request.Builder()
            .url("$base/auth/v1/token?grant_type=password")
            .addHeader("apikey", anonKey)
            .addHeader("Content-Type", "application/json")
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .build()
        return try {
            val res = client.newCall(req).execute()
            val body = res.body?.string() ?: "{}"
            if (!res.isSuccessful) {
                val err = try { JSONObject(body).optString("error_description", body) } catch (_: Exception) { body }
                Result.failure(Exception(err))
            } else {
                val obj = JSONObject(body)
                val accessToken = obj.optString("access_token", null).takeIf { it.isNotEmpty() }
                    ?: return Result.failure(Exception("No access_token en respuesta"))
                Result.success(accessToken)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
