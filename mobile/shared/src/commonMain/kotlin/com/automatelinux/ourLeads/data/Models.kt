package com.automatelinux.ourLeads.data

import kotlinx.serialization.Serializable

@Serializable
data class Msg(
    val id: String,
    val chatJid: String,
    val fromMe: Boolean = false,
    /** Written by the customer himself, in his own chat. */
    val fromCustomer: Boolean = false,
    val sentAt: String = "",
    val content: String = "",
    val mediaType: String = "",
    val mediaUrl: String? = null,
    /** Videos only: a still frame for the top of the card. */
    val posterUrl: String? = null,
    val transcript: String? = null,
    val error: String? = null,
    val source: String? = null,
    /** Photos only: does it show the customer's phone — none | partial | full, null = not checked yet. */
    val phoneShown: String? = null,
)

@Serializable
data class LeadEvent(
    val id: Int = 0,
    val at: String,
    val who: String,
    val kind: String,
    val text: String? = null,
    val from: String? = null,
    val to: String? = null,
    /** Who last corrected this line by hand, or null. */
    val editedBy: String? = null,
)

@Serializable
data class Proposal(
    val status: String? = null,
    val statusLabel: String? = null,
    /** What confirming does, in words: "פגישה · רביעי 14.10 10:00". */
    val summary: String = "",
    /** What the customer said, in one sentence. */
    val why: String = "",
    val who: String = "",
    val at: String = "",
)

@Serializable
data class Lead(
    val id: Int,
    val source: String,
    val title: String,
    val trade: String? = null,
    val customerName: String? = null,
    val phones: List<String> = emptyList(),
    val address: String? = null,
    val city: String? = null,
    val details: String? = null,
    val status: String,
    val statusLabel: String,
    /** A change the customer's own chat suggests; nothing moves until one of us confirms it. */
    val proposal: Proposal? = null,
    /** The user id whose move it is ("the ball is in his hands"), "customer" while we wait for him; null = nobody yet. */
    val holder: String? = null,
    /** holder = "customer" only: the day both of us check back with him ("2026-10-09"). */
    val checkBackAt: String? = null,
    /** That day has come: it is both partners' move. */
    val checkBackDue: Boolean = false,
    val nextStep: String? = null,
    val visitAt: String? = null,
    /** "2026-10-09T10:00" Israel time — a meeting before there is a contract (green). */
    val meetingAt: String? = null,
    /** "2026-10-12" — working days once there is a contract (red). */
    val workStart: String? = null,
    val workEnd: String? = null,
    val deal: Deal = Deal(),
    val createdAt: String,
    val updatedAt: String,
    val lastMessageAt: String? = null,
    /** The last time anything happened to it (edit, message, history line). */
    val touchedAt: String = "",
    val messages: List<Msg> = emptyList(),
    val events: List<LeadEvent> = emptyList(),
)

/** What the client pays and what the subcontractor gets. vat: true = "+ מע״מ", false = included. */
@Serializable
data class Deal(
    val clientPrice: Double? = null,
    val clientVat: Boolean? = null,
    val subName: String? = null,
    val subPhone: String? = null,
    val subPrice: Double? = null,
    val subVat: Boolean? = null,
)

@Serializable
data class Me(val id: String, val name: String)

/**
 * Busy mode for the business line: busy = the assistant answers customers for us
 * while we are on a job. [configured] = the line is connected to Meta.
 */
@Serializable
data class AssistantState(
    val id: String = "assistant",
    val name: String = "העוזר",
    val configured: Boolean = false,
    val busy: Boolean = false,
    val at: String? = null,
    val by: String? = null,
)

@Serializable
data class StatusDef(val id: String, val label: String)

@Serializable
data class SourceDef(val id: String, val label: String, val actor: String)

@Serializable
data class BoardData(
    val me: Me,
    val statuses: List<StatusDef>,
    val sources: List<SourceDef>,
    /** Who the ball can be passed to. */
    val people: List<Me> = emptyList(),
    /** The ball's third place — the customer's hands. */
    val customer: Me = Me("customer", "הלקוח"),
    /** The business line's assistant: a place the ball can be, and the busy switch. */
    val assistant: AssistantState = AssistantState(),
    val leads: List<Lead>,
    val unassigned: List<Msg> = emptyList(),
    val pending: Int = 0,
)

@Serializable
data class Change(
    val leadId: Int,
    val title: String,
    val from: String? = null,
    val to: String? = null,
    val note: String? = null,
    val created: Boolean = false,
)

@Serializable
data class CommandReply(val said: String, val reply: String, val changes: List<Change> = emptyList())

@Serializable
data class ErrorBody(val error: String? = null)

@Serializable
data class ShareLink(val token: String, val url: String)

@Serializable
data class SentBatch(val batch: String, val kind: String, val to: String, val messages: Int, val sentBy: String, val sentAt: String)

@Serializable
data class SentList(val sends: List<SentBatch>)

@Serializable
data class ClearResult(val deleted: Int, val failed: List<String> = emptyList())

@Serializable
data class ReportChoice(val id: Int, val title: String, val group: String)

@Serializable
data class ReportText(val parts: List<String>, val leadIds: List<Int> = emptyList(), val choices: List<ReportChoice> = emptyList())
