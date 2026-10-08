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

    /** Pass the ball: the lead is now in [holder]'s hands (a user id or "customer"); null = nobody's. */
    suspend fun setHolder(leadId: Int, holder: String?): Result<Unit> {
        val body = JsonObject(mapOf("holder" to (holder?.let { JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull))).toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** The customer holds the ball until [day] ("2026-10-09"); then it is both partners' move. */
    suspend fun setCheckBack(leadId: Int, day: String): Result<Unit> {
        val body = JsonObject(mapOf("checkBackAt" to JsonPrimitive(day))).toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId", token, body, "application/json; charset=utf-8")
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

    /**
     * A link to this lead's card that opens with no sign-in, leaving out what [hide]
     * names (contact, address, price, photos, history). Returns the URL to send.
     */
    suspend fun createShare(leadId: Int, hide: List<String>): Result<String> {
        val body = JsonObject(mapOf("hide" to kotlinx.serialization.json.JsonArray(hide.map { JsonPrimitive(it) })))
            .toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId/shares", token, body, "application/json; charset=utf-8")
        if (r.code != 200) return Result.Err(describe(r))
        return runCatching { Result.Ok(json.decodeFromString(ShareLink.serializer(), r.text).url) }
            .getOrElse { Result.Err("תשובה לא תקינה מהשרת") }
    }

    /**
     * Send this lead's card as plain WhatsApp text to [to] ("preview" = קבוצה ריקה,
     * "dudu"), leaving out what [hide] names.
     */
    suspend fun sendCardText(leadId: Int, hide: List<String>, to: String): Result<Unit> {
        val body = JsonObject(mapOf("to" to JsonPrimitive(to), "hide" to kotlinx.serialization.json.JsonArray(hide.map { JsonPrimitive(it) })))
            .toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId/send-text", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** The report exactly as it would be sent — [ids] narrows it to those leads, null = every open lead. */
    suspend fun report(ids: List<Int>? = null): Result<ReportText> {
        val r = httpRequest("GET", "$base/api/report" + (ids?.let { "?ids=${it.joinToString(",")}" } ?: ""), token, null, null)
        if (r.code != 200) return Result.Err(describe(r))
        return runCatching { Result.Ok(json.decodeFromString(ReportText.serializer(), r.text)) }
            .getOrElse { Result.Err("תשובה לא תקינה מהשרת") }
    }

    /** Send the report to [to] ("preview" or "dudu") — only [ids], or every open lead when null. */
    suspend fun sendReport(to: String, ids: List<Int>? = null): Result<Unit> {
        val fields = mutableMapOf<String, kotlinx.serialization.json.JsonElement>("to" to JsonPrimitive(to))
        ids?.let { fields["ids"] = kotlinx.serialization.json.JsonArray(it.map { id -> JsonPrimitive(id) }) }
        val r = httpRequest("POST", "$base/api/report", token, JsonObject(fields).toString().encodeToByteArray(), "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Sends WhatsApp still lets us delete: [leadId]'s cards, or the reports when null. */
    suspend fun recentSends(leadId: Int?): Result<List<SentBatch>> {
        val r = httpRequest("GET", "$base/api/sent" + (leadId?.let { "?leadId=$it" } ?: ""), token, null, null)
        if (r.code != 200) return Result.Err(describe(r))
        return runCatching { Result.Ok(json.decodeFromString(SentList.serializer(), r.text).sends) }
            .getOrElse { Result.Err("תשובה לא תקינה מהשרת") }
    }

    /** Delete a send for everyone in WhatsApp — every message in it. */
    suspend fun deleteSend(batch: String): Result<Unit> {
        val r = httpRequest("DELETE", "$base/api/sent/$batch", token, null, null)
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Delete for everyone every message the app put in קבוצה ריקה. */
    suspend fun clearPreview(): Result<ClearResult> {
        val r = httpRequest("POST", "$base/api/sent/clear-preview", token, "{}".encodeToByteArray(), "application/json; charset=utf-8")
        if (r.code != 200) return Result.Err(describe(r))
        return runCatching { Result.Ok(json.decodeFromString(ClearResult.serializer(), r.text)) }
            .getOrElse { Result.Err("תשובה לא תקינה מהשרת") }
    }

    /** Correct a history line's text. */
    suspend fun editEvent(id: Int, text: String): Result<Unit> {
        val body = JsonObject(mapOf("text" to JsonPrimitive(text))).toString().encodeToByteArray()
        val r = httpRequest("PATCH", "$base/api/events/$id", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Confirm ([accept] = true) or reject the change the customer's chat proposed. */
    suspend fun resolveProposal(leadId: Int, accept: Boolean): Result<Unit> {
        val body = JsonObject(mapOf("accept" to JsonPrimitive(accept))).toString().encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId/proposal", token, body, "application/json; charset=utf-8")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Someone opened the lead — it counts as touching it for "last touched first". */
    suspend fun markViewed(leadId: Int): Result<Unit> {
        val r = httpRequest("POST", "$base/api/leads/$leadId/viewed", token, null, null)
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Take a history line off the lead (the server keeps it, marked with who removed it). */
    suspend fun deleteEvent(id: Int): Result<Unit> {
        val r = httpRequest("DELETE", "$base/api/events/$id", token, null, null)
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
    }

    /** Add photos straight to a lead (JPEG bytes each). */
    suspend fun addPhotos(leadId: Int, photos: List<ByteArray>): Result<Unit> {
        val boundary = "----ourleadsphotos${photos.sumOf { it.size }}x${photos.size}"
        var body = ByteArray(0)
        photos.forEachIndexed { i, p ->
            body += ("--$boundary\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"photo$i.jpg\"\r\n" +
                "Content-Type: image/jpeg\r\n\r\n").encodeToByteArray() + p + "\r\n".encodeToByteArray()
        }
        body += "--$boundary--\r\n".encodeToByteArray()
        val r = httpRequest("POST", "$base/api/leads/$leadId/photos", token, body, "multipart/form-data; boundary=$boundary")
        return if (r.code == 200) Result.Ok(Unit) else Result.Err(describe(r))
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
