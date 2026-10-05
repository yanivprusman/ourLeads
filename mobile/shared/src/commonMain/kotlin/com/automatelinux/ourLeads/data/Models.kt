package com.automatelinux.ourLeads.data

import kotlinx.serialization.Serializable

@Serializable
data class Msg(
    val id: String,
    val chatJid: String,
    val fromMe: Boolean = false,
    val sentAt: String = "",
    val content: String = "",
    val mediaType: String = "",
    val mediaUrl: String? = null,
    val transcript: String? = null,
    val error: String? = null,
    val source: String? = null,
)

@Serializable
data class LeadEvent(
    val at: String,
    val who: String,
    val kind: String,
    val text: String? = null,
    val from: String? = null,
    val to: String? = null,
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
    val nextStep: String? = null,
    val visitAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val lastMessageAt: String? = null,
    val messages: List<Msg> = emptyList(),
    val events: List<LeadEvent> = emptyList(),
)

@Serializable
data class Me(val id: String, val name: String)

@Serializable
data class StatusDef(val id: String, val label: String)

@Serializable
data class SourceDef(val id: String, val label: String, val partner: String)

@Serializable
data class BoardData(
    val me: Me,
    val statuses: List<StatusDef>,
    val sources: List<SourceDef>,
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
