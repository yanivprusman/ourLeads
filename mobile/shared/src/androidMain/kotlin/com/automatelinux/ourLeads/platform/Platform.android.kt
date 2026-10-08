package com.automatelinux.ourLeads.platform

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaRecorder
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import java.io.File
import kotlinx.coroutines.launch

actual fun decodeImage(bytes: ByteArray, full: Boolean): ImageBitmap? {
    // Thumbnails and the detail view never need the camera's full resolution;
    // decoding at a quarter keeps a lead with ten photos from eating the heap.
    // The full-screen viewer is the exception: it shows one photo at screen
    // size, where a halved bitmap blurs the text in a WhatsApp screenshot.
    val opts = BitmapFactory.Options().apply { inSampleSize = if (full) 1 else 2 }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
}

private class AndroidRecorder(
    private val context: Context,
    private val askPermission: () -> Unit,
) : VoiceRecorder {
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var startedAt = 0L
    override var permissionDenied by mutableStateOf(false)

    override fun start(): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            askPermission()
            return false
        }
        val f = File(context.cacheDir, "say-${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        return try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(16_000)
            r.setAudioEncodingBitRate(48_000)
            r.setOutputFile(f.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = f
            startedAt = System.currentTimeMillis()
            true
        } catch (e: Exception) {
            r.release()
            f.delete()
            false
        }
    }

    override fun stop(): Recording? {
        val r = recorder ?: return null
        val f = file
        recorder = null
        file = null
        val ms = System.currentTimeMillis() - startedAt
        val ok = runCatching { r.stop() }.isSuccess
        r.release()
        if (!ok || f == null || ms < 600) {
            f?.delete()
            return null
        }
        val bytes = f.readBytes()
        f.delete()
        return Recording(bytes, "say.m4a", "audio/mp4", ms)
    }

    override fun cancel() {
        recorder?.let { runCatching { it.stop() }; it.release() }
        recorder = null
        file?.delete()
        file = null
    }
}

@Composable
actual fun rememberVoiceRecorder(): VoiceRecorder {
    val context = LocalContext.current
    var holder by remember { mutableStateOf<AndroidRecorder?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        holder?.permissionDenied = !granted
    }
    return remember(context) {
        AndroidRecorder(context) { launcher.launch(Manifest.permission.RECORD_AUDIO) }.also { holder = it }
    }
}

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {
    androidx.activity.compose.BackHandler(enabled, onBack)
}

@Composable
actual fun rememberShareText(): (subject: String, text: String) -> Unit {
    val context = LocalContext.current
    return remember(context) {
        { subject, text ->
            val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_SUBJECT, subject)
                putExtra(android.content.Intent.EXTRA_TEXT, text)
            }
            context.startActivity(android.content.Intent.createChooser(send, "שליחת הכרטיס").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

/** Longest side of a sent photo: enough to read a WhatsApp screenshot or see a crack, far less than the camera's 4000+. */
private const val PHOTO_MAX_SIDE = 2048

@Composable
actual fun rememberPhotoPicker(onPicked: (List<ByteArray>) -> Unit): () -> Unit {
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(30)) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            val photos = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                uris.mapNotNull { uri -> scaledJpeg(context, uri) }
            }
            onPicked(photos)
        }
    }
    return remember(launcher) {
        { launcher.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    }
}

private fun scaledJpeg(context: Context, uri: android.net.Uri): ByteArray? {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= PHOTO_MAX_SIDE) sample *= 2
    val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
    // The camera stores rotation as an EXIF tag; a re-encoded JPEG drops it, so apply it to the pixels.
    val degrees = resolver.openInputStream(uri)?.use {
        when (androidx.exifinterface.media.ExifInterface(it).getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 1)) {
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    } ?: 0f
    val scale = minOf(1f, PHOTO_MAX_SIDE.toFloat() / maxOf(decoded.width, decoded.height))
    val m = android.graphics.Matrix().apply { postScale(scale, scale); postRotate(degrees) }
    val bmp = android.graphics.Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true)
    val out = java.io.ByteArrayOutputStream()
    bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
    return out.toByteArray()
}

@Composable
actual fun rememberBoolPref(key: String, default: Boolean): androidx.compose.runtime.MutableState<Boolean> {
    val prefs = LocalContext.current.getSharedPreferences("ourleads_prefs", Context.MODE_PRIVATE)
    val state = remember(key) { mutableStateOf(prefs.getBoolean(key, default)) }
    return remember(key, state) {
        object : androidx.compose.runtime.MutableState<Boolean> by state {
            override var value: Boolean
                get() = state.value
                set(v) { state.value = v; prefs.edit().putBoolean(key, v).apply() }
        }
    }
}

@Composable
actual fun VideoPlayer(url: String, modifier: androidx.compose.ui.Modifier, onError: (String) -> Unit) {
    androidx.compose.ui.viewinterop.AndroidView(
        modifier = modifier,
        factory = { ctx ->
            // VideoView keeps the video's own aspect ratio, so it sits centred in a frame.
            val video = android.widget.VideoView(ctx)
            val frame = android.widget.FrameLayout(ctx)
            frame.addView(
                video,
                android.widget.FrameLayout.LayoutParams(
                    android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                    android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                    android.view.Gravity.CENTER,
                ),
            )
            val controls = android.widget.MediaController(ctx)
            controls.setAnchorView(video)
            video.setMediaController(controls)
            video.setOnPreparedListener { video.start(); controls.show(0) }
            video.setOnErrorListener { _, what, extra -> onError("הסרטון לא נטען ($what/$extra)"); true }
            video.setVideoURI(android.net.Uri.parse(url))
            frame
        },
        onRelease = { frame -> (frame.getChildAt(0) as android.widget.VideoView).stopPlayback() },
    )
}
