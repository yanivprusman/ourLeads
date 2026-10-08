package com.automatelinux.ourLeads.platform

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.ImageBitmap

/** Hold-to-talk recorder. `start` asks for the microphone the first time. */
interface VoiceRecorder {
    /** True when recording actually began. */
    fun start(): Boolean
    /** Stop and return the recording, or null if nothing usable was captured. */
    fun stop(): Recording?
    fun cancel()
    val permissionDenied: Boolean
}

class Recording(val bytes: ByteArray, val fileName: String, val mime: String, val durationMs: Long)

@Composable
expect fun rememberVoiceRecorder(): VoiceRecorder

expect fun decodeImage(bytes: ByteArray, full: Boolean = false): ImageBitmap?

/** The system back gesture closes an open lead instead of leaving the app. */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)

/**
 * Saves every lead's phone number to the phone's contacts, so a customer who calls back
 * shows up by name. Contacts stay on the phone (its local account, never a cloud one), under
 * an "ourLeads" label.
 */
interface ContactSync {
    /** The user tapped [problem]: ask again for the contacts permission. */
    fun setUp()
    /** Writes leads that are new or changed since the last pass. Safe to call on every board load. */
    suspend fun sync(leads: List<com.automatelinux.ourLeads.data.Lead>, sources: List<com.automatelinux.ourLeads.data.SourceDef>)
    /** Why contacts are not being saved, in Hebrew; null when they are. Tapping it calls [setUp]. */
    val problem: String?
}

@Composable
expect fun rememberContactSync(): ContactSync

/** Hands text to the system share sheet — WhatsApp, email, anything the phone has. */
@Composable
expect fun rememberShareText(): (subject: String, text: String) -> Unit

/**
 * Pick photos from the gallery. Returns the launcher; [onPicked] gets each photo as
 * JPEG bytes, already scaled down to a size worth sending over the VPN.
 */
@Composable
expect fun rememberPhotoPicker(onPicked: (List<ByteArray>) -> Unit): () -> Unit

/** A per-device on/off preference that survives restarts (a viewer's convenience, never shared state). */
@Composable
expect fun rememberBoolPref(key: String, default: Boolean): androidx.compose.runtime.MutableState<Boolean>
