package com.automatelinux.outLeads.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * The Android half of [httpRequest], on the JDK's own client. The read timeout
 * is long because a spoken status is transcribed and then read by Claude on the
 * server before the answer comes back.
 */
actual suspend fun httpRequest(
    method: String,
    url: String,
    token: String,
    body: ByteArray?,
    contentType: String?,
): HttpResult = withContext(Dispatchers.IO) {
    var conn: HttpURLConnection? = null
    try {
        conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 180_000
            if (token.isNotEmpty()) setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", contentType ?: "application/octet-stream")
                setFixedLengthStreamingMode(body.size)
                outputStream.use { it.write(body) }
            }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        HttpResult(code, stream?.use { it.readBytes() } ?: ByteArray(0))
    } catch (e: IOException) {
        HttpResult(0, ByteArray(0), e.message ?: "no connection")
    } finally {
        conn?.disconnect()
    }
}
