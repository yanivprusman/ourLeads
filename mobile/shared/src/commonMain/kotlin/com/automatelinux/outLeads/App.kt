package com.automatelinux.outLeads

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.automatelinux.outLeads.data.*
import com.automatelinux.outLeads.platform.PlatformBackHandler
import com.automatelinux.outLeads.platform.decodeImage
import com.automatelinux.outLeads.platform.rememberVoiceRecorder
import com.automatelinux.outLeads.ui.theme.AppTheme
import kotlinx.coroutines.delay
import kotlinx.datetime.toLocalDateTime
import kotlinx.coroutines.launch

private val CLOSED = setOf("done", "lost")
private val Brand = Color(0xFF1F5F8B)
private val Ink = Color(0xFF16202B)
private val Muted = Color(0xFF5D6B7A)
private val Line = Color(0xFFE3E8EE)
private val Paper = Color(0xFFF5F7F9)

private fun statusColors(s: String): Pair<Color, Color> = when (s) {
    "new" -> Color(0xFFE0F2FE) to Color(0xFF0C4A6E)
    "contacted" -> Color(0xFFE0E7FF) to Color(0xFF312E81)
    "visit_scheduled" -> Color(0xFFFEF3C7) to Color(0xFF78350F)
    "quoted" -> Color(0xFFEDE9FE) to Color(0xFF4C1D95)
    "won" -> Color(0xFFD1FAE5) to Color(0xFF064E3B)
    "done" -> Color(0xFFE2E8F0) to Color(0xFF334155)
    "on_hold" -> Color(0xFFFFEDD5) to Color(0xFF7C2D12)
    else -> Color(0xFFFFE4E6) to Color(0xFF881337)
}

/** "2026-10-05T14:34:31.000Z" → "05.10 17:34" (Israel time, by offset). */
private fun short(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    return runCatching {
        val instant = kotlinx.datetime.Instant.parse(iso)
        val t = instant.toLocalDateTime(kotlinx.datetime.TimeZone.of("Asia/Jerusalem"))
        "${t.dayOfMonth.toString().padStart(2, '0')}.${t.monthNumber.toString().padStart(2, '0')} " +
            "${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}"
    }.getOrDefault("")
}

private fun prettyPhone(p: String): String = if (p.length == 10) "${p.take(3)}-${p.drop(3)}" else p
private fun intlPhone(p: String): String = if (p.startsWith("0")) "972" + p.drop(1) else p

@Composable
fun App(baseUrl: String, token: String) {
    val api = remember { OutLeadsApi(baseUrl, token) }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        AppTheme {
            Surface(Modifier.fillMaxSize(), color = Paper) { BoardScreen(api) }
        }
    }
}

@Composable
private fun BoardScreen(api: OutLeadsApi) {
    var data by remember { mutableStateOf<BoardData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var view by remember { mutableStateOf("open") }
    var source by remember { mutableStateOf("all") }
    var openId by remember { mutableStateOf<Int?>(null) }
    var reply by remember { mutableStateOf<CommandReply?>(null) }
    var refreshTick by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        when (val r = api.board()) {
            is Result.Ok -> { data = r.value; error = null }
            is Result.Err -> error = r.message
        }
    }
    LaunchedEffect(refreshTick) {
        while (true) {
            load()
            delay(15_000)
        }
    }
    val refresh: () -> Unit = { refreshTick++ }

    val d = data
    val open = d?.leads?.firstOrNull { it.id == openId }
    PlatformBackHandler(enabled = open != null) { openId = null }

    Scaffold(
        containerColor = Paper,
        bottomBar = {
            VoiceBar(api) { r ->
                reply = r
                openId = null
                refresh()
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                d == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(error ?: "טוען…", color = if (error != null) Color(0xFFB91C1C) else Muted, modifier = Modifier.padding(24.dp))
                }
                open != null -> LeadScreen(api, d, open, onBack = { openId = null }) { scope.launch { load() } }
                else -> LeadList(
                    d, error, view, source, reply,
                    onView = { view = it },
                    onSource = { source = it },
                    onOpen = { openId = it },
                    onDismissReply = { reply = null },
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LeadList(
    d: BoardData,
    error: String?,
    view: String,
    source: String,
    reply: CommandReply?,
    onView: (String) -> Unit,
    onSource: (String) -> Unit,
    onOpen: (Int) -> Unit,
    onDismissReply: () -> Unit,
) {
    val inSource = d.leads.filter { source == "all" || it.source == source }
    val leads = inSource.filter {
        when (view) {
            "all" -> true
            "open" -> it.status !in CLOSED
            else -> it.status == view
        }
    }
    val tabs = buildList {
        add(Triple("open", "פתוחים", inSource.count { it.status !in CLOSED }))
        d.statuses.forEach { s -> inSource.count { it.status == s.id }.takeIf { it > 0 }?.let { add(Triple(s.id, s.label, it)) } }
        add(Triple("all", "הכל", inSource.size))
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
        stickyHeader {
            Column(Modifier.fillMaxWidth().background(Color.White).padding(top = 12.dp)) {
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("outLeads", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Spacer(Modifier.width(10.dp))
                    Text("שלום ${d.me.name}", color = Muted, fontSize = 14.sp)
                    Spacer(Modifier.weight(1f))
                    if (d.pending > 0) Text("${d.pending} בעיבוד", color = Color(0xFFB45309), fontSize = 12.sp)
                }
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf(SourceDef("all", "כל השותפים", "")) + d.sources) { s ->
                        val sel = s.id == source
                        Text(
                            s.label,
                            color = if (sel) Color.White else Muted,
                            fontSize = 14.sp,
                            modifier = Modifier.clip(CircleShape).background(if (sel) Ink else Color.White)
                                .border(1.dp, if (sel) Ink else Line, CircleShape)
                                .clickable { onSource(s.id) }.padding(horizontal = 12.dp, vertical = 5.dp),
                        )
                    }
                }
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    items(tabs) { (id, label, n) ->
                        val sel = id == view
                        Column(Modifier.clickable { onView(id) }) {
                            Text("$label $n", color = if (sel) Ink else Muted, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, fontSize = 14.sp)
                            Spacer(Modifier.height(6.dp))
                            Box(Modifier.height(2.dp).fillMaxWidth().background(if (sel) Brand else Color.Transparent))
                        }
                    }
                }
                HorizontalDivider(color = Line)
            }
        }
        if (error != null) item { Text(error, color = Color(0xFFB91C1C), modifier = Modifier.padding(16.dp)) }
        if (reply != null) item { ReplyCard(reply, onOpen, onDismissReply) }
        if (leads.isEmpty()) item { Text("אין כאן לידים.", color = Muted, modifier = Modifier.fillMaxWidth().padding(48.dp)) }
        items(leads, key = { it.id }) { l -> LeadCard(d, l) { onOpen(l.id) } }
    }
}

@Composable
private fun ReplyCard(reply: CommandReply, onOpen: (Int) -> Unit, onDismiss: () -> Unit) {
    Column(
        Modifier.padding(16.dp, 12.dp, 16.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF0F9FF)).border(1.dp, Brand.copy(alpha = .3f), RoundedCornerShape(12.dp))
            .clickable { onDismiss() }.padding(12.dp),
    ) {
        Text("״${reply.said}״", color = Muted, fontSize = 14.sp)
        Text(reply.reply, color = Ink, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 4.dp))
        reply.changes.forEach { c ->
            Text(
                "#${c.leadId} ${c.title}" + (c.to?.let { " → $it" } ?: ""),
                color = Brand, fontSize = 14.sp,
                modifier = Modifier.padding(top = 2.dp).clickable { onOpen(c.leadId) },
            )
        }
    }
}

@Composable
private fun StatusPill(status: String, label: String) {
    val (bg, fg) = statusColors(status)
    Text(label, color = fg, fontSize = 12.sp, fontWeight = FontWeight.Medium,
        modifier = Modifier.clip(CircleShape).background(bg).padding(horizontal = 8.dp, vertical = 2.dp))
}

@Composable
private fun LeadCard(d: BoardData, l: Lead, onClick: () -> Unit) {
    val src = d.sources.firstOrNull { it.id == l.source }
    val thumb = l.messages.firstOrNull { it.mediaType == "image" && it.mediaUrl != null }?.mediaUrl
    Row(
        Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Color.White).border(1.dp, Line, RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusPill(l.status, l.statusLabel)
                Spacer(Modifier.width(8.dp))
                Text(src?.label ?: "", color = Muted, fontSize = 12.sp)
                Spacer(Modifier.weight(1f))
                Text(short(l.lastMessageAt ?: l.createdAt), color = Muted, fontSize = 12.sp)
            }
            Text(l.title, fontWeight = FontWeight.SemiBold, color = Ink, fontSize = 16.sp, modifier = Modifier.padding(top = 6.dp))
            val sub = listOfNotNull(l.customerName, l.phones.firstOrNull()?.let(::prettyPhone), l.visitAt?.let { "ביקור: $it" }).joinToString(" · ")
            if (sub.isNotEmpty()) Text(sub, color = Muted, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            l.nextStep?.let { Text("← $it", color = Ink, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp)) }
        }
        if (thumb != null) {
            Spacer(Modifier.width(10.dp))
            RemoteImage(d, thumb, Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)))
        }
    }
}

private val imageCache = mutableMapOf<String, ImageBitmap>()
private var apiForImages: OutLeadsApi? = null

@Composable
private fun RemoteImage(@Suppress("UNUSED_PARAMETER") d: BoardData, path: String, modifier: Modifier, crop: Boolean = true) {
    var bmp by remember(path) { mutableStateOf(imageCache[path]) }
    LaunchedEffect(path) {
        if (bmp == null) apiForImages?.media(path)?.let(::decodeImage)?.let { imageCache[path] = it; bmp = it }
    }
    val b = bmp
    if (b != null) Image(b, null, modifier, contentScale = if (crop) ContentScale.Crop else ContentScale.Fit)
    else Box(modifier.background(Line))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadScreen(api: OutLeadsApi, d: BoardData, l: Lead, onBack: () -> Unit, onChanged: () -> Unit) {
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val src = d.sources.firstOrNull { it.id == l.source }
    val partner = src?.partner?.substringBefore(" ") ?: "שותף"
    val place = listOfNotNull(l.address, l.city).joinToString(", ")

    fun change(status: String?) {
        busy = true
        scope.launch {
            when (val r = api.setStatus(l.id, status, note)) {
                is Result.Ok -> { note = ""; error = null; onChanged() }
                is Result.Err -> error = r.message
            }
            busy = false
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Row(Modifier.fillMaxWidth().background(Color.White).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "חזרה") }
                Column(Modifier.weight(1f)) {
                    Text("#${l.id} · ${src?.label ?: ""}", color = Muted, fontSize = 12.sp)
                    Text(l.title, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Ink)
                }
            }
            HorizontalDivider(color = Line)
        }
        item {
            FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                d.statuses.forEach { s ->
                    val sel = s.id == l.status
                    val (bg, fg) = statusColors(s.id)
                    Text(
                        s.label,
                        color = if (sel) fg else Muted,
                        fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.clip(CircleShape).background(if (sel) bg else Color.White)
                            .border(if (sel) 2.dp else 1.dp, if (sel) fg else Line, CircleShape)
                            .clickable(enabled = !busy && !sel) { change(s.id) }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    )
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White)
                .border(1.dp, Line, RoundedCornerShape(12.dp)).padding(14.dp)) {
                l.customerName?.let { InfoRow("לקוח", it) }
                l.trade?.let { InfoRow("עבודה", it) }
                if (place.isNotEmpty()) InfoRow("מקום", place)
                l.visitAt?.let { InfoRow("ביקור", it) }
                l.nextStep?.let { InfoRow("הצעד הבא", it) }
                l.details?.let {
                    HorizontalDivider(color = Line, modifier = Modifier.padding(vertical = 8.dp))
                    Text(it, color = Ink, fontSize = 15.sp, lineHeight = 22.sp)
                }
            }
        }
        item {
            FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                l.phones.forEach { p ->
                    AssistChip(onClick = { uri.openUri("tel:$p") }, label = { Text(prettyPhone(p)) }, leadingIcon = { Icon(Icons.Default.Call, null) })
                    AssistChip(onClick = { uri.openUri("https://wa.me/${intlPhone(p)}") }, label = { Text("וואטסאפ") })
                }
                if (place.isNotEmpty()) AssistChip(
                    onClick = { uri.openUri("https://waze.com/ul?q=${place.encodeUrl()}&navigate=yes") },
                    label = { Text("Waze") }, leadingIcon = { Icon(Icons.Default.Navigation, null) },
                )
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(note, { note = it }, Modifier.weight(1f), placeholder = { Text("הערה להיסטוריה") }, singleLine = true)
                Spacer(Modifier.width(8.dp))
                Button(onClick = { change(null) }, enabled = !busy && note.isNotBlank(), colors = ButtonDefaults.buttonColors(containerColor = Ink)) { Text("שמירה") }
            }
            error?.let { Text(it, color = Color(0xFFB91C1C), modifier = Modifier.padding(16.dp, 6.dp)) }
        }
        item { SectionTitle("מהוואטסאפ") }
        items(l.messages, key = { it.id }) { m -> MessageItem(api, d, m, partner) }
        item { SectionTitle("היסטוריה") }
        items(l.events.reversed()) { e ->
            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(8.dp))
                .background(Color.White).border(1.dp, Line, RoundedCornerShape(8.dp)).padding(10.dp)) {
                Text("${short(e.at)} · ${e.who}", color = Muted, fontSize = 11.sp)
                e.to?.let { Text((e.from?.let { f -> "$f ← " } ?: "") + it, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                e.text?.let { Text(it, fontSize = 14.sp, color = Ink) }
            }
        }
    }
}

private fun String.encodeUrl(): String = buildString {
    for (b in this@encodeUrl.encodeToByteArray()) {
        val c = b.toInt() and 0xff
        if (c in 'a'.code..'z'.code || c in 'A'.code..'Z'.code || c in '0'.code..'9'.code || c == '-'.code || c == '.'.code || c == '_'.code) append(c.toChar())
        else append('%').append(c.toString(16).uppercase().padStart(2, '0'))
    }
}

@Composable
private fun SectionTitle(t: String) =
    Text(t, fontWeight = FontWeight.SemiBold, color = Ink, fontSize = 16.sp, modifier = Modifier.padding(16.dp, 18.dp, 16.dp, 6.dp))

@Composable
private fun InfoRow(k: String, v: String) {
    Row(Modifier.padding(vertical = 3.dp)) {
        Text(k, color = Muted, fontSize = 14.sp, modifier = Modifier.width(80.dp))
        Text(v, color = Ink, fontSize = 14.sp)
    }
}

@Composable
private fun MessageItem(api: OutLeadsApi, d: BoardData, m: Msg, partner: String) {
    val uri = LocalUriHandler.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = if (m.fromMe) Arrangement.Start else Arrangement.End) {
        Column(
            Modifier.fillMaxWidth(.85f).clip(RoundedCornerShape(14.dp))
                .background(if (m.fromMe) Color(0xFFECFDF5) else Color.White)
                .border(1.dp, Line, RoundedCornerShape(14.dp)).padding(10.dp),
        ) {
            Text("${if (m.fromMe) "אני" else partner} · ${short(m.sentAt)}", color = Muted, fontSize = 11.sp)
            when {
                m.mediaType == "image" && m.mediaUrl != null ->
                    RemoteImage(d, m.mediaUrl, Modifier.padding(top = 4.dp).fillMaxWidth().heightIn(max = 280.dp).clip(RoundedCornerShape(8.dp))
                        .clickable { uri.openUri(api.base + m.mediaUrl) }, crop = false)
                (m.mediaType == "audio" || m.mediaType == "video") && m.mediaUrl != null ->
                    AssistChip(onClick = { uri.openUri(api.base + m.mediaUrl) },
                        label = { Text(if (m.mediaType == "audio") "השמעה" else "סרטון") },
                        leadingIcon = { Icon(Icons.Default.PlayArrow, null) })
                m.mediaType.isNotEmpty() -> Text("[${m.mediaType}]", color = Muted)
            }
            m.transcript?.let { Text("״$it״", color = Ink, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 4.dp)) }
            if (m.content.isNotBlank()) Text(m.content, color = Ink, fontSize = 15.sp, lineHeight = 21.sp, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
private fun VoiceBar(api: OutLeadsApi, onReply: (CommandReply) -> Unit) {
    apiForImages = api
    val recorder = rememberVoiceRecorder()
    val scope = rememberCoroutineScope()
    var recording by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    fun handle(r: Result<CommandReply>) {
        when (r) {
            is Result.Ok -> { onReply(r.value); text = ""; error = null }
            is Result.Err -> error = r.message
        }
        working = false
    }

    Surface(color = Color.White, shadowElevation = 8.dp) {
        Column(Modifier.navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 10.dp)) {
            error?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 13.sp, modifier = Modifier.padding(bottom = 6.dp)) }
            if (recorder.permissionDenied) Text("צריך הרשאת מיקרופון כדי לדבר עם הלוח", color = Color(0xFFB91C1C), fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(if (recording) 64.dp else 56.dp).clip(CircleShape)
                        .background(if (recording) Color(0xFFDC2626) else if (working) Muted else Brand)
                        .pointerInput(working) {
                            if (working) return@pointerInput
                            detectTapGestures(onPress = {
                                error = null
                                if (!recorder.start()) return@detectTapGestures
                                recording = true
                                tryAwaitRelease()
                                recording = false
                                val rec = recorder.stop()
                                if (rec == null) { error = "החזיקו את הכפתור בזמן הדיבור"; return@detectTapGestures }
                                working = true
                                scope.launch { handle(api.sayAudio(rec.bytes, rec.fileName, rec.mime)) }
                            })
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (working) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
                    else Icon(Icons.Default.Mic, "החזיקו ודברו", tint = Color.White)
                }
                Spacer(Modifier.width(10.dp))
                OutlinedTextField(
                    text, { text = it }, Modifier.weight(1f),
                    placeholder = { Text(if (recording) "מקליט… שחררו לשליחה" else "החזיקו ודברו, או כתבו", fontSize = 14.sp) },
                    singleLine = true, enabled = !working && !recording, shape = RoundedCornerShape(28.dp),
                )
                IconButton(
                    onClick = { working = true; scope.launch { handle(api.sayText(text)) } },
                    enabled = text.isNotBlank() && !working,
                ) { Icon(Icons.AutoMirrored.Filled.Send, "שליחה", tint = if (text.isNotBlank()) Brand else Muted) }
            }
        }
    }
}
