package com.automatelinux.outLeads.platform

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

expect fun decodeImage(bytes: ByteArray): ImageBitmap?

/** The system back gesture closes an open lead instead of leaving the app. */
@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)
