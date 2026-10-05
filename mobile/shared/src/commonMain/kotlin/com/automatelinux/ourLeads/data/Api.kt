package com.automatelinux.ourLeads.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One HTTP round trip — the Android half is on the JDK client. */
expect suspend fun httpRequest(
    method: String,
    url: String,
    token: String,
    body: ByteArray?,
    contentType: String?,
): HttpResult

class HttpResult(val code: Int, val bytes: ByteArray, val transportError: String? = null) {
    val text: String get() = bytes.decodeToString()
}

sealed class Result<out T> {
    data class Ok<T>(val value: T) : Result<T>()
    data class Err(val message: String) : Result<Nothing>()
}

private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

/**
 * Everything the app says to the board. Failures come back as sentences, not
 * exceptions: this is used in a van between jobs, and "the VPN is down" has to
 * read as that rather than as a spinner.
 */
class OurLeadsApi(baseUrl: String, private val token: String) {
    val base = baseUrl.trimEnd('/')
    val configured: Boolean get() = token.isNotEmpty()

    private fun describe(r: HttpResult): String {
        val server = runCatching { json.decodeFromString(ErrorBody.serializer(), r.text).error }.getOrNull()
        return when {
            r.code == 0 -> "אין חיבור לשרת — בדקו שה‑VPN פעיל"
            r.code == 401 -> "המכשיר לא מורשה מול השרת (טוקן שגוי)"
            server != null -> server
            else -> "השרת החזיר תשובה לא צפויה (${r.code})"
        }
    }

    suspend fun board(): Result<BoardData> {
        if (!configured) return Result.Err(NO_TOKEN)
        val r = httpRequest("GET", "$base/api/leads", token, null, null)
        if (r.code != 200) return Result.Err(describe(r))
        return runCatching { Result.Ok(json.decodeFromString(BoardData.serializer(), r.text)) }
            .getOrElse { Result.Err("תשובה לא תקינה מהשרת: ${it.message}") }
    }

    suspend fun setStatus(leadId: Int, status: String?, note: String?): Result<Unit> {
        val fields = buildMap<String, JsonPrimitive> {
            if (status != null) put("status", JsonPrimitive(status))
            if (!note.isNullOrBlank()) put("note", JsonPrimitive(note))
        }
        val body = JsonObject(fields).toString().encodeToByteArray()
        // POST, not PATCH: the JDK client has no PATCH verb; the route takes both.
        val r =httpRequest("POST", "$base/api/leads/$leadId", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Replace the deal on a lead. Empty fields clear. */
    suspend fun setDeal(leadId: Int, d: Deal): Result<Unit> {
        fun n(v: Double?) = v?.let { JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull
        fun b(v: Boolean?, on: Double?) = if (on == null || v == null) kotlinx.serialization.json.JsonNull else JsonPrimitive(v)
        fun t(v: String?) = v?.takeIf { it.isNotBlank() }?.let { JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull
        val body = JsonObject(
            mapOf(
                "clientPrice" to n(d.clientPrice), "clientVat" to b(d.clientVat, d.clientPrice),
                "subName" to t(d.subName), "subPhone" to t(d.subPhone),
                "subPrice" to n(d.subPrice), "subVat" to b(d.subVat, d.subPrice),
            ),
        ).toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Put a lead on the calendar, or take it off (null). Only the keys given are changed. */
    suspend fun setSchedule(leadId: Int, fields: Map<String, String?>): Result<Unit> {
        val body = JsonObject(fields.mapValues { (_, v) -> v?.let { JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull })
            .toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    suspend fun sayAudio(leadId: Int, audio: ByteArray, fileName: String, mime: String): Result<CommandReply> {
        val boundary = "----ourleads${audio.size}x${audio.hashCode()}"
        val head = "--$boundary\r\nContent-Disposition: form-data; name=\"leadId\"\r\n\r\n$leadId\r\n" +
            "--$boundary\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"$fileName\"\r\n" +
            "Content-Type: $mime\r\n\r\n"
        val tail = "\r\n--$boundary--\r\n"
        val body = head.encodeToByteArray() + audio + tail.encodeToByteArray()
        return command(httpRequest("POST", "$base/api/command", token, body, "multipart/form-data; boundary=$boundary"))
    }

    private fun command(r: HttpResult): Result<CommandReply> {
        if (r.code != 200) return Result.Err(describe(r))
        return runCatching { Result.Ok(json.decodeFromString(CommandReply.serializer(), r.text)) }
            .getOrElse { Result.Err("תשובה לא תקינה מהשרת") }
    }

    /** Media URLs are signed by the server and need no token. */
    suspend fun media(path: String): ByteArray? {
        val r = httpRequest("GET", base + path, "", null, null)
        return if (r.code == 200) r.bytes else null
    }

    companion object {
        const val NO_TOKEN = "בבנייה הזו אין טוקן גישה (mobile/.env → API_TOKEN)"
    }
}
