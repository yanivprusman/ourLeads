package com.automatelinux.ourLeads

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.automatelinux.ourLeads.data.*
import com.automatelinux.ourLeads.platform.rememberBoolPref
import com.automatelinux.ourLeads.platform.PlatformBackHandler
import com.automatelinux.ourLeads.platform.decodeImage
import com.automatelinux.ourLeads.platform.VoiceRecorder
import com.automatelinux.ourLeads.platform.rememberContactSync
import com.automatelinux.ourLeads.platform.rememberShareText
import com.automatelinux.ourLeads.platform.rememberPhotoPicker
import com.automatelinux.ourLeads.platform.rememberVoiceRecorder
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.plus
import kotlinx.datetime.minus

// ── Tokens: the icon's palette ───────────────────────────────────────────────
private val Ink = Color(0xFF0D2A43)
private val Ink2 = Color(0xFF2B4258)
private val Muted = Color(0xFF637589)
private val Line = Color(0xFFE2E8EE)
private val Track = Color(0xFFCBD5DF)
private val Paper = Color(0xFFF3F6F9)
private val Harbour = Color(0xFF14466B)
private val Harbour2 = Color(0xFF1F74A3)
private val Deep = Color(0xFF0B2236)
private val Sky = Color(0xFF8FD3F4)
private val Amber = Color(0xFFEF8A24)
private val AmberSoft = Color(0xFFFFF1DF)
private val Basis = Color(0xFF1F74A3)
private val Israel = Color(0xFF0F8A6A)
private val Danger = Color(0xFF9B1C1C)

private val Band = Brush.radialGradient(
    0f to Harbour2, 0.45f to Harbour, 1f to Deep,
    center = Offset(0f, 0f), radius = 1400f,
)

/** Where a lead stands — dates optional. "removed" takes it off the board (it can come back). */
private val STATES = listOf("none", "meeting", "work")
private val CLOSED = setOf("removed")

private data class Tone(val dot: Color, val bg: Color, val fg: Color)
private fun tone(s: String): Tone = when (s) {
    "none" -> Tone(Amber, AmberSoft, Color(0xFF8A4A0B))
    "meeting" -> Tone(MeetGreen, MeetSoft, MeetInk)
    "work" -> Tone(WorkRed, WorkSoft, WorkInk)
    else -> Tone(Color(0xFFD4DBE2), Color(0xFFF3F5F7), Color(0xFF8A9AAB))
}
private fun partnerColor(src: String) = if (src == "israel") Israel else Basis
private fun partnerInitial(src: String) = if (src == "israel") "י" else "ב"

private val LocalApi = staticCompositionLocalOf<OurLeadsApi> { error("no api") }
private val LocalDockBottom = staticCompositionLocalOf { 12.dp }
private val LocalMark = staticCompositionLocalOf<@Composable (Modifier) -> Unit> { { } }

// ── Small helpers ────────────────────────────────────────────────────────────
private val tz = TimeZone.of("Asia/Jerusalem")
private fun instant(iso: String?): Instant? = iso?.let { runCatching { Instant.parse(it) }.getOrNull() }
private fun two(n: Int) = n.toString().padStart(2, '0')

private fun short(iso: String?): String {
    val i = instant(iso) ?: return ""
    val t = i.toLocalDateTime(tz)
    val today = Clock.System.now().toLocalDateTime(tz).date
    return if (t.date == today) "${two(t.hour)}:${two(t.minute)}"
    else "${t.dayOfMonth}.${t.monthNumber} ${two(t.hour)}:${two(t.minute)}"
}

private fun prettyPhone(p: String) = if (p.length == 10) "${p.take(3)}-${p.drop(3)}" else p
private fun intlPhone(p: String) = if (p.startsWith("0")) "972" + p.drop(1) else p
private fun String.encodeUrl(): String = buildString {
    for (b in this@encodeUrl.encodeToByteArray()) {
        val c = b.toInt() and 0xff
        if (c in 'a'.code..'z'.code || c in 'A'.code..'Z'.code || c in '0'.code..'9'.code || c == '-'.code || c == '.'.code || c == '_'.code) append(c.toChar())
        else append('%').append(c.toString(16).uppercase().padStart(2, '0'))
    }
}

// ── Entry ────────────────────────────────────────────────────────────────────
@Composable
fun App(
    baseUrl: String,
    token: String,
    fontFamily: FontFamily,
    mark: @Composable (Modifier) -> Unit,
    /** Room under the voice dock: dev builds pin the feedback-lib button in that corner. */
    dockBottom: Dp = 12.dp,
) {
    val api = remember { OurLeadsApi(baseUrl, token) }
    val base = MaterialTheme.typography
    val type = remember(fontFamily) {
        Typography(
            displaySmall = base.displaySmall.copy(fontFamily = fontFamily),
            headlineSmall = base.headlineSmall.copy(fontFamily = fontFamily),
            titleLarge = base.titleLarge.copy(fontFamily = fontFamily),
            titleMedium = base.titleMedium.copy(fontFamily = fontFamily),
            titleSmall = base.titleSmall.copy(fontFamily = fontFamily),
            bodyLarge = base.bodyLarge.copy(fontFamily = fontFamily),
            bodyMedium = base.bodyMedium.copy(fontFamily = fontFamily),
            bodySmall = base.bodySmall.copy(fontFamily = fontFamily),
            labelLarge = base.labelLarge.copy(fontFamily = fontFamily),
            labelMedium = base.labelMedium.copy(fontFamily = fontFamily),
            labelSmall = base.labelSmall.copy(fontFamily = fontFamily),
        )
    }
    MaterialTheme(
        colorScheme = lightColorScheme(primary = Harbour, onPrimary = Color.White, background = Paper, surface = Color.White),
        typography = type,
    ) {
        CompositionLocalProvider(
            LocalLayoutDirection provides LayoutDirection.Rtl,
            LocalApi provides api,
            LocalMark provides mark,
            LocalDockBottom provides dockBottom,
            LocalTextStyle provides TextStyle(fontFamily = fontFamily, color = Ink),
        ) {
            Box(Modifier.fillMaxSize().background(Paper)) { BoardScreen() }
        }
    }
}

@Composable
private fun T(
    text: String,
    size: Int = 15,
    weight: FontWeight = FontWeight.Normal,
    color: Color = Ink,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    lineHeight: Int = 0,
    strike: Boolean = false,
) = Text(
    text, modifier = modifier, fontSize = size.sp, fontWeight = weight, color = color, maxLines = maxLines,
    overflow = TextOverflow.Ellipsis, lineHeight = if (lineHeight > 0) lineHeight.sp else androidx.compose.ui.unit.TextUnit.Unspecified,
    textDecoration = if (strike) TextDecoration.LineThrough else null,
)

/** Content scrolls under a transparent status bar; this keeps the clock readable. */
@Composable
private fun StatusScrim() {
    Box(Modifier.fillMaxWidth().background(Deep).statusBarsPadding())
}

// ── Board ────────────────────────────────────────────────────────────────────
@Composable
private fun BoardScreen() {
    val api = LocalApi.current
    var data by remember { mutableStateOf<BoardData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var view by remember { mutableStateOf("open") }
    var source by remember { mutableStateOf("all") }
    // Whose hands the lead is in — any of these ids (user ids, the customer, NOBODY). Empty = everyone (הכל).
    var balls by remember { mutableStateOf(emptySet<String>()) }
    var mode by remember { mutableStateOf("leads") }
    var openId by remember { mutableStateOf<Int?>(null) }
    var reply by remember { mutableStateOf<CommandReply?>(null) }
    var talkError by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val contacts = rememberContactSync()

    suspend fun load() {
        when (val r = api.board()) {
            is Result.Ok -> { data = r.value; error = null; contacts.sync(r.value.leads, r.value.sources) }
            is Result.Err -> error = r.message
        }
    }
    LaunchedEffect(tick) { while (true) { load(); delay(15_000) } }

    val d = data
    val open = d?.leads?.firstOrNull { it.id == openId }
    PlatformBackHandler(enabled = open != null) { openId = null }

    Box(Modifier.fillMaxSize()) {
        if (d == null) {
            Box(Modifier.fillMaxSize().background(Band), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    val pulse by rememberInfiniteTransition().animateFloat(0.6f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse))
                    LocalMark.current(Modifier.size(72.dp).alpha(pulse))
                    error?.let { T(it, 15, color = Color.White, modifier = Modifier.padding(24.dp)) }
                }
            }
        } else {
            LeadList(d, error, view, source, balls, mode, onView = { view = it }, onSource = { source = it }, onBalls = { balls = it }, onMode = { mode = it }, onOpen = { openId = it }, onReply = { reply = it; talkError = null; tick++ }, onError = { talkError = it; reply = null })
            AnimatedVisibility(
                reply != null, Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically { it / 2 } + fadeIn(), exit = fadeOut(),
            ) {
                reply?.let { ReplyBubble(it, { reply = null }, Modifier.navigationBarsPadding().padding(start = 14.dp, end = 14.dp, bottom = LocalDockBottom.current)) }
            }
            contacts.problem?.let {
                T(it, 13, FontWeight.SemiBold, Ink, Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 6.dp)
                    .clip(CircleShape).background(Color(0xFFFFF4DC)).clickable { contacts.setUp() }.padding(horizontal = 14.dp, vertical = 6.dp))
            }
            talkError?.let {
                T(it, 14, FontWeight.SemiBold, Danger, Modifier.align(Alignment.BottomCenter).navigationBarsPadding()
                    .padding(start = 14.dp, end = 14.dp, bottom = LocalDockBottom.current).fillMaxWidth()
                    .shadow(10.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)).background(Color(0xFFFDE8E8))
                    .clickable { talkError = null }.padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
        StatusScrim()
        AnimatedVisibility(
            visible = open != null,
            enter = slideInHorizontally { -it } + fadeIn(),
            exit = slideOutHorizontally { -it } + fadeOut(),
        ) {
            val lead = open ?: d?.leads?.firstOrNull { it.id == openId }
            if (lead != null && d != null) LeadScreen(d, lead, onBack = { openId = null }) { scope.launch { load() } }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LeadList(
    d: BoardData, error: String?, view: String, source: String, balls: Set<String>, mode: String,
    onView: (String) -> Unit, onSource: (String) -> Unit, onBalls: (Set<String>) -> Unit, onReply: (CommandReply) -> Unit, onError: (String) -> Unit, onMode: (String) -> Unit, onOpen: (Int) -> Unit,
) {
    val inSource = d.leads.filter { (source == "all" || it.source == source) && (balls.isEmpty() || balls.any { b -> when (b) { NOBODY -> it.holder == null; d.customer.id -> it.holder == b; else -> it.holder == b || it.checkBackDue } }) }
    val leads = inSource.filter { if (view == "open") it.status !in CLOSED else it.status == view }
    val label = { id: String -> d.statuses.firstOrNull { it.id == id }?.label ?: id }
    val openCount = inSource.count { it.status !in CLOSED }
    val haptic = LocalHapticFeedback.current
    var reporting by remember { mutableStateOf(false) }
    if (reporting) ReportDialog(onDismiss = { reporting = false })

    val header: @Composable () -> Unit = {
            Column(Modifier.fillMaxWidth().background(Band).statusBarsPadding().padding(top = 14.dp, bottom = 16.dp)) {
            Row(Modifier.padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                LocalMark.current(Modifier.size(40.dp).shadow(6.dp, RoundedCornerShape(24)))
                Spacer(Modifier.width(12.dp))
                Column {
                    T("ourLeads", 22, FontWeight.ExtraBold, Color.White)
                    T("$openCount פתוחים · שלום ${d.me.name}", 13, color = Color.White.copy(alpha = .72f))
                }
                Spacer(Modifier.weight(1f))
                HeaderClear()
                Spacer(Modifier.width(8.dp))
                T(
                    "דוח", 13, FontWeight.SemiBold, Color.White,
                    Modifier.clip(CircleShape).background(Color.White.copy(alpha = .12f)).clickable { reporting = true }.padding(horizontal = 12.dp, vertical = 7.dp),
                )
                if (d.pending > 0) Spacer(Modifier.width(8.dp))
                if (d.pending > 0) Row(
                    Modifier.clip(CircleShape).background(Color.White.copy(alpha = .1f)).padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(Amber))
                    Spacer(Modifier.width(6.dp))
                    T("${d.pending} בקריאה", 12, color = Color.White)
                }
            }
            // Leads / calendar
            Row(Modifier.padding(start = 18.dp, top = 16.dp).clip(CircleShape).background(Color.White.copy(alpha = .1f)).padding(4.dp)) {
                listOf("leads" to "לידים", "calendar" to "יומן").forEach { (id, label) ->
                    val sel = id == mode
                    T(
                        label, 14, if (sel) FontWeight.Bold else FontWeight.Normal, if (sel) Color.White else Color.White.copy(alpha = .82f),
                        Modifier.clip(CircleShape).background(if (sel) Amber else Color.Transparent)
                            .clickable { onMode(id) }.padding(horizontal = 16.dp, vertical = 7.dp),
                    )
                }
            }
            // Partner switch
            Row(
                Modifier.padding(start = 18.dp, top = 8.dp).clip(CircleShape).background(Color.White.copy(alpha = .1f)).padding(4.dp),
            ) {
                (listOf(SourceDef("all", "כולם", "")) + d.sources).forEach { s ->
                    val sel = s.id == source
                    T(
                        s.label, 14, if (sel) FontWeight.SemiBold else FontWeight.Normal, if (sel) Ink else Color.White.copy(alpha = .82f),
                        Modifier.clip(CircleShape).background(if (sel) Color.White else Color.Transparent)
                            .clickable { onSource(s.id) }.padding(horizontal = 14.dp, vertical = 7.dp),
                    )
                }
            }
            // Whose hands the ball is in
            if (d.people.isNotEmpty()) Row(
                Modifier.padding(start = 18.dp, top = 8.dp).clip(CircleShape).background(Color.White.copy(alpha = .1f)).padding(4.dp),
            ) {
                (listOf("all" to "הכל") + d.people.map { it.id to holderLabel(d, it.id) } + (d.customer.id to holderLabel(d, d.customer.id)) + (NOBODY to "אצל אף אחד")).forEach { (id, label) ->
                    val sel = if (id == "all") balls.isEmpty() else id in balls
                    T(
                        label, 14, if (sel) FontWeight.SemiBold else FontWeight.Normal, if (sel) Ink else Color.White.copy(alpha = .82f),
                        Modifier.clip(CircleShape).background(if (sel) Color.White else Color.Transparent)
                            // הכל clears the rest. Any other chip: a tap adds or drops it, a long press shows it alone.
                            .combinedClickable(
                                onLongClick = { haptic.performHapticFeedback(HapticFeedbackType.LongPress); onBalls(if (id == "all") emptySet() else setOf(id)) },
                                onClick = { onBalls(if (id == "all") emptySet() else if (id in balls) balls - id else balls + id) },
                            ).padding(horizontal = 14.dp, vertical = 7.dp),
                    )
                }
            }
            // Where the leads stand
            if (mode == "leads") LazyRow(
                Modifier.padding(top = 14.dp),
                contentPadding = PaddingValues(horizontal = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item { Stage("הכל", openCount, view == "open", null) { onView("open") } }
                item { Spacer(Modifier.width(4.dp)) }
                items(STATES) { s -> Stage(label(s), inSource.count { it.status == s }, view == s, tone(s).dot) { onView(s) } }
                item { Spacer(Modifier.width(4.dp)) }
                item { Stage("הוסרו", inSource.count { it.status == "removed" }, view == "removed", tone("removed").dot) { onView("removed") } }
            }
        }
    }
    if (mode == "calendar") {
        CalendarScreen(d, inSource, header, onOpen)
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item { header() }
        if (error != null) item { T(error, 14, color = Danger, modifier = Modifier.padding(18.dp, 12.dp)) }
        item { Spacer(Modifier.height(8.dp)) }
        // One list in the server's order (latest message first). Status never reorders it:
        // marking a lead פגישה or עבודה must not make it jump away from where the user tapped it.
        items(leads, key = { it.id }) { LeadCard(d, it, onReply, onError) { onOpen(it.id) } }
        if (leads.isEmpty()) item {
            Column(Modifier.fillMaxWidth().padding(56.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                LocalMark.current(Modifier.size(52.dp).alpha(.3f))
                T("אין כאן לידים.", 15, color = Muted, modifier = Modifier.padding(top = 12.dp))
            }
        }
    }
}

@Composable
private fun Stage(label: String, n: Int, active: Boolean, dot: Color?, onClick: () -> Unit) {
    val bg = when { active -> Color.White; n > 0 -> Color.White.copy(alpha = .09f); else -> Color.White.copy(alpha = .05f) }
    val fg = when { active -> Ink; n > 0 -> Color.White; else -> Color.White.copy(alpha = .45f) }
    Column(
        Modifier.widthIn(min = 72.dp).clip(RoundedCornerShape(14.dp)).background(bg).clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        T("$n", 21, FontWeight.Bold, fg)
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (dot != null) { Box(Modifier.size(6.dp).clip(CircleShape).background(dot)); Spacer(Modifier.width(4.dp)) }
            T(label, 12, color = fg, maxLines = 1)
        }
    }
}

@Composable
private fun PartnerBadge(src: String, label: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(partnerColor(src)), contentAlignment = Alignment.Center) {
            T(partnerInitial(src), 11, FontWeight.Bold, Color.White)
        }
        Spacer(Modifier.width(5.dp))
        T(label ?: "", 12, color = Muted)
    }
}

@Composable
private fun Pill(text: String, bg: Color, fg: Color, strike: Boolean = false) =
    T(text, 12, FontWeight.SemiBold, fg, Modifier.clip(CircleShape).background(bg).padding(horizontal = 8.dp, vertical = 2.dp), strike = strike)

@Composable
private fun LeadCard(d: BoardData, l: Lead, onReply: (CommandReply) -> Unit, onError: (String) -> Unit, onClick: () -> Unit) {
    val uri = LocalUriHandler.current
    val t = tone(l.status)
    val thumb = l.messages.firstOrNull { it.mediaType == "image" && it.mediaUrl != null }?.mediaUrl
    val phone = l.phones.firstOrNull()
    val faded = l.status in CLOSED
    Column(
        Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().alpha(if (faded) .7f else 1f)
            .shadow(2.dp, RoundedCornerShape(18.dp), ambientColor = Ink.copy(alpha = .08f), spotColor = Ink.copy(alpha = .08f))
            .clip(RoundedCornerShape(18.dp)).background(Color.White),
    ) {
        Row(Modifier.height(IntrinsicSize.Min).clickable(onClick = onClick)) {
            Box(Modifier.width(4.dp).fillMaxHeight().background(t.dot))
            Row(Modifier.weight(1f).padding(14.dp)) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PartnerBadge(l.source, d.sources.firstOrNull { it.id == l.source }?.label)
                        l.holder?.let {
                            Spacer(Modifier.width(8.dp))
                            when {
                                l.checkBackDue -> Pill("לבדוק עם הלקוח", Amber, Color.White)
                                it == d.customer.id -> Pill(holderLabel(d, it) + (l.checkBackAt?.let { c -> " · עד ${sayDay(c)}" } ?: ""), AmberSoft, Color(0xFF8A4A0B))
                                else -> Pill(holderLabel(d, it), if (it == d.me.id) Harbour else Color(0xFFE6EEF5), if (it == d.me.id) Color.White else Harbour)
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        when (l.status) {
                            "work" -> Pill("עבודה" + (l.workStart?.let { s0 -> " ${sayDay(s0)}" + (l.workEnd?.takeIf { it != s0 }?.let { " – ${sayDay(it)}" } ?: "") } ?: ""), t.bg, t.fg)
                            "meeting" -> Pill("פגישה" + (l.meetingAt?.let { " ${sayDay(it)} ${it.drop(11).take(5)}" } ?: ""), t.bg, t.fg)
                            "none" -> T(short(l.lastMessageAt ?: l.createdAt), 12, color = Muted)
                            else -> Pill(l.statusLabel, t.bg, t.fg)
                        }
                    }
                    T(l.title, 17, FontWeight.Bold, modifier = Modifier.padding(top = 8.dp), maxLines = 2, lineHeight = 22)
                    val sub = listOfNotNull(l.customerName, l.city).joinToString(" · ").ifEmpty { l.trade ?: "" }
                    if (sub.isNotEmpty()) T(sub, 14, color = Muted, maxLines = 1, modifier = Modifier.padding(top = 2.dp))
                    l.nextStep?.let { T("← $it", 14, color = Ink2, maxLines = 1, modifier = Modifier.padding(top = 6.dp)) }
                    DealLine(l.deal)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (thumb != null) RemoteImage(thumb, Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, Line, RoundedCornerShape(12.dp)))
                    Spacer(Modifier.weight(1f).heightIn(min = 10.dp))
                    CardTalk(l, onReply, onError)
                }
            }
        }
        if (phone != null && !faded) {
            HorizontalDivider(color = Line)
            Row(Modifier.height(IntrinsicSize.Min)) {
                QuickAction(Icons.Default.Call, prettyPhone(phone), Harbour, Modifier.weight(1f)) { uri.openUri("tel:$phone") }
                Box(Modifier.width(1.dp).fillMaxHeight().background(Line))
                QuickAction(Icons.AutoMirrored.Filled.Chat, "וואטסאפ", Israel, Modifier.weight(1f)) { uri.openUri("https://wa.me/${intlPhone(phone)}") }
            }
        }
    }
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, color: Color, modifier: Modifier, onClick: () -> Unit) {
    Row(modifier.clickable(onClick = onClick).padding(vertical = 11.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = color, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(6.dp))
        T(label, 14, FontWeight.SemiBold, color)
    }
}

// ── Images ───────────────────────────────────────────────────────────────────
private val imageCache = mutableMapOf<String, ImageBitmap>()

@Composable
private fun RemoteImage(path: String, modifier: Modifier, crop: Boolean = true, full: Boolean = false) {
    val api = LocalApi.current
    val key = if (full) "$path#full" else path
    var bmp by remember(key) { mutableStateOf(imageCache[key]) }
    LaunchedEffect(key) {
        if (bmp == null) api.media(path)?.let { decodeImage(it, full) }?.let { imageCache[key] = it; bmp = it }
    }
    val b = bmp
    if (b != null) Image(b, null, modifier, contentScale = if (crop) ContentScale.Crop else ContentScale.Fit)
    else Box(modifier.background(Brush.linearGradient(listOf(Line, Paper))))
}

// ── Lead ─────────────────────────────────────────────────────────────────────
private sealed class Item(val at: String) {
    class M(val m: Msg) : Item(m.sentAt)
    class E(val e: LeadEvent) : Item(e.at)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LeadScreen(d: BoardData, l: Lead, onBack: () -> Unit, onChanged: () -> Unit) {
    val api = LocalApi.current
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var photo by remember { mutableStateOf<Int?>(null) } // index into photos, open in the viewer
    var said by remember(l.id) { mutableStateOf<CommandReply?>(null) }
    var talkError by remember(l.id) { mutableStateOf<String?>(null) }
    var sharing by remember(l.id) { mutableStateOf(false) }
    var uploading by remember(l.id) { mutableStateOf(false) }
    // Photos from a site visit go straight onto the lead — never through the WhatsApp
    // chat, where the extractor would read them as a new lead.
    val pickPhotos = rememberPhotoPicker { picked ->
        if (picked.isEmpty()) return@rememberPhotoPicker
        uploading = true
        scope.launch {
            when (val r = api.addPhotos(l.id, picked)) {
                is Result.Ok -> { error = null; onChanged() }
                is Result.Err -> error = r.message
            }
            uploading = false
        }
    }
    val src = d.sources.firstOrNull { it.id == l.source }
    val partner = src?.actor ?: "שותף"
    val place = listOfNotNull(l.address, l.city).joinToString(", ")
    val photos = l.messages.filter { it.mediaType == "image" && it.mediaUrl != null }.map { it.mediaUrl!! }
    val label = { id: String -> d.statuses.firstOrNull { it.id == id }?.label ?: id }

    fun change(status: String?) {
        if (busy) return
        busy = true
        scope.launch {
            when (val r = api.setStatus(l.id, status, note)) {
                is Result.Ok -> {
                    note = ""; error = null; onChanged()
                    // A removed lead is done with — return to the list rather than stay on it.
                    if (status == "removed") onBack()
                }
                is Result.Err -> error = r.message
            }
            busy = false
        }
    }

    var newestFirst by rememberBoolPref("timeline_newest_first", false)
    val timeline = (l.messages.filter { it.mediaType != "image" }.map { Item.M(it) } + l.events.map { Item.E(it) })
        .sortedBy { it.at }.let { if (newestFirst) it.reversed() else it }

    if (sharing) ShareDialog(l, onDismiss = { sharing = false }, onShared = onChanged)

    Box(Modifier.fillMaxSize().background(Paper)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 48.dp)) {
            item {
                Box(Modifier.fillMaxWidth().background(Band)) {
                    if (photos.isNotEmpty()) {
                        LazyRow(Modifier.height(260.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            itemsIndexed(photos) { i, p ->
                                val w = if (photos.size == 1) Modifier.fillParentMaxWidth() else Modifier.width(220.dp)
                                RemoteImage(p, Modifier.fillParentMaxHeight().then(w).clickable { photo = i })
                            }
                        }
                    }
                    Column(
                        Modifier.align(Alignment.BottomStart).fillMaxWidth()
                            .then(if (photos.isNotEmpty()) Modifier.background(Brush.verticalGradient(listOf(Color.Transparent, Deep.copy(alpha = .85f), Deep))) else Modifier.statusBarsPadding())
                            .padding(start = 20.dp, end = 20.dp, top = if (photos.isNotEmpty()) 60.dp else 64.dp, bottom = 18.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(20.dp).clip(CircleShape).background(partnerColor(l.source)), contentAlignment = Alignment.Center) {
                                T(partnerInitial(l.source), 11, FontWeight.Bold, Color.White)
                            }
                            Spacer(Modifier.width(6.dp))
                            T("${src?.label ?: ""} · #${l.id}", 12, color = Color.White.copy(alpha = .8f))
                        }
                        T(l.title, 24, FontWeight.ExtraBold, Color.White, Modifier.padding(top = 6.dp), lineHeight = 30)
                        val sub = listOfNotNull(l.customerName, place.ifEmpty { null }).joinToString(" · ")
                        if (sub.isNotEmpty()) T(sub, 14, color = Color.White.copy(alpha = .8f), modifier = Modifier.padding(top = 4.dp))
                    }
                    Box(
                        Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(12.dp).size(42.dp).clip(CircleShape)
                            .background(Color.Black.copy(alpha = .35f)).clickable(onClick = onBack),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Default.Close, "סגירה", tint = Color.White) }
                    Row(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 12.dp, end = 62.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            Modifier.height(42.dp).clip(CircleShape).background(Color.Black.copy(alpha = .35f))
                                .clickable { sharing = true }.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.Share, null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            T("שתף", 14, FontWeight.SemiBold, Color.White)
                        }
                        Row(
                            Modifier.height(42.dp).clip(CircleShape).background(Color.Black.copy(alpha = if (uploading) .2f else .35f))
                                .clickable(enabled = !uploading) { pickPhotos() }.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.AddAPhoto, null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            T(if (uploading) "מעלה…" else "תמונות", 14, FontWeight.SemiBold, Color.White)
                        }
                    }
                }
            }
            item {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    val p = l.phones.firstOrNull()
                    CardTalk(l, onReply = { said = it; talkError = null; onChanged() }, onError = { talkError = it; said = null })
                    BigAction(Icons.Default.Call, "התקשר", Harbour, p != null, Modifier.weight(1f)) { uri.openUri("tel:$p") }
                    BigAction(Icons.AutoMirrored.Filled.Chat, "וואטסאפ", Israel, p != null, Modifier.weight(1f)) { uri.openUri("https://wa.me/${intlPhone(p!!)}") }
                    BigAction(Icons.Default.Navigation, "נווט", Color(0xFF2A6FD6), place.isNotEmpty(), Modifier.weight(1f)) {
                        uri.openUri("https://waze.com/ul?q=${place.encodeUrl()}&navigate=yes")
                    }
                }
                said?.let { ReplyBubble(it, { said = null }, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp)) }
                talkError?.let {
                    T(it, 14, FontWeight.SemiBold, Danger, Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp).fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp)).background(Color(0xFFFDE8E8)).clickable { talkError = null }
                        .padding(horizontal = 16.dp, vertical = 12.dp))
                }
                if (l.phones.size > 1) FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    l.phones.drop(1).forEach { p ->
                        T(prettyPhone(p), 14, modifier = Modifier.clip(CircleShape).background(Color.White).border(1.dp, Line, CircleShape)
                            .clickable { uri.openUri("tel:$p") }.padding(horizontal = 12.dp, vertical = 5.dp))
                    }
                }
            }
            item {
                // Where the lead stands — a meeting or work can be set with or without a date.
                Surface(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line)) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (l.status == "removed") {
                            T("הליד הוסר מהלוח", 14, color = Muted, modifier = Modifier.weight(1f).padding(horizontal = 6.dp))
                            T(
                                "החזר ללוח", 14, FontWeight.SemiBold, Color.White,
                                Modifier.clip(CircleShape).background(Harbour).clickable(enabled = !busy) { change("none") }
                                    .padding(horizontal = 16.dp, vertical = 9.dp),
                            )
                        } else {
                            Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Paper).padding(4.dp)) {
                                STATES.forEach { s ->
                                    val sel = s == l.status
                                    val t = tone(s)
                                    Row(
                                        Modifier.weight(1f).clip(RoundedCornerShape(9.dp)).background(if (sel) t.bg else Color.Transparent)
                                            .clickable(enabled = !busy && !sel) { change(s) }.padding(vertical = 10.dp),
                                        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Box(Modifier.size(8.dp).clip(CircleShape).background(t.dot))
                                        Spacer(Modifier.width(6.dp))
                                        T(label(s), 14, if (sel) FontWeight.Bold else FontWeight.Normal, if (sel) t.fg else Muted)
                                    }
                                }
                            }
                            Spacer(Modifier.width(8.dp))
                            T(
                                "הסר", 14, color = Muted,
                                modifier = Modifier.clip(CircleShape).border(1.dp, Line, CircleShape).clickable(enabled = !busy) { change("removed") }
                                    .padding(horizontal = 14.dp, vertical = 9.dp),
                            )
                        }
                    }
                }
            }
            if (d.people.isNotEmpty()) item {
                HolderPicker(d, l, busy, onCheckBack = { day ->
                    busy = true
                    scope.launch {
                        when (val r = api.setCheckBack(l.id, day)) {
                            is Result.Ok -> { error = null; onChanged() }
                            is Result.Err -> error = r.message
                        }
                        busy = false
                    }
                }) { id ->
                    busy = true
                    scope.launch {
                        when (val r = api.setHolder(l.id, id)) {
                            is Result.Ok -> { error = null; onChanged() }
                            is Result.Err -> error = r.message
                        }
                        busy = false
                    }
                }
            }
            item {
                ScheduleSection(l, busy) { fields ->
                    busy = true
                    scope.launch {
                        when (val r = api.setSchedule(l.id, fields)) {
                            is Result.Ok -> { error = null; onChanged() }
                            is Result.Err -> error = r.message
                        }
                        busy = false
                    }
                }
            }
            item {
                DealSection(l.deal, busy) { d ->
                    busy = true
                    scope.launch {
                        when (val r = api.setDeal(l.id, d)) {
                            is Result.Ok -> { error = null; onChanged() }
                            is Result.Err -> error = r.message
                        }
                        busy = false
                    }
                }
            }
            item {
                Surface(Modifier.padding(16.dp).fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line)) {
                    Column {
                        val facts = listOfNotNull(
                            l.nextStep?.let { Triple("הצעד הבא", it, true) },
                            l.visitAt?.takeIf { l.meetingAt == null }?.let { Triple("ביקור", it, false) },
                        )
                        facts.forEach { (k, v, strong) ->
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                                T(k, 14, color = Muted, modifier = Modifier.width(84.dp))
                                T(v, 14, if (strong) FontWeight.SemiBold else FontWeight.Normal, if (strong) Ink else Ink2)
                            }
                            HorizontalDivider(color = Line)
                        }
                        // Tap to correct what the extractor got wrong ("חיזוק אריחים" that is really "איטום פסיפס").
                        fun save(key: String, v: String?) {
                            if (busy) return
                            busy = true
                            scope.launch {
                                when (val r = api.setSchedule(l.id, mapOf(key to v))) {
                                    is Result.Ok -> { error = null; onChanged() }
                                    is Result.Err -> error = r.message
                                }
                                busy = false
                            }
                        }
                        EditFact("כותרת", l.title, busy) { v -> if (v != null) save("title", v) }
                        HorizontalDivider(color = Line)
                        EditFact("עבודה", l.trade, busy) { save("trade", it) }
                        HorizontalDivider(color = Line)
                        EditFact("לקוח", l.customerName, busy) { save("customerName", it) }
                        place.ifEmpty { null }?.let {
                            HorizontalDivider(color = Line)
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                                T("כתובת", 14, color = Muted, modifier = Modifier.width(84.dp))
                                T(it, 14, color = Ink2)
                            }
                        }
                        l.details?.let {
                            HorizontalDivider(color = Line)
                            T(it, 15, color = Ink2, lineHeight = 23, modifier = Modifier.padding(16.dp))
                        }
                    }
                }
            }
            item {
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    BasicTextField(
                        note, { note = it },
                        Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White).border(1.dp, Line, RoundedCornerShape(14.dp))
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        textStyle = LocalTextStyle.current.copy(fontSize = 16.sp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { if (note.isNotBlank()) change(null) }),
                        decorationBox = { inner -> if (note.isEmpty()) T("הוסיפו הערה…", 16, color = Muted); inner() },
                    )
                    Spacer(Modifier.width(8.dp))
                    T(
                        "שמור", 15, FontWeight.SemiBold, Color.White,
                        Modifier.clip(RoundedCornerShape(14.dp)).background(if (note.isNotBlank() && !busy) Harbour else Harbour.copy(alpha = .35f))
                            .clickable(enabled = note.isNotBlank() && !busy) { change(null) }.padding(horizontal = 20.dp, vertical = 14.dp),
                    )
                }
                error?.let { T(it, 14, color = Danger, modifier = Modifier.padding(16.dp, 8.dp)) }
                Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 16.dp, top = 24.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    T("מה קרה עד עכשיו", 13, FontWeight.Bold, Ink2, Modifier.weight(1f))
                    Row(Modifier.clip(CircleShape).background(Color.White).border(1.dp, Line, CircleShape).padding(2.dp)) {
                        listOf(true to "חדש קודם", false to "ישן קודם").forEach { (v, label) ->
                            val sel = newestFirst == v
                            T(
                                label, 12, if (sel) FontWeight.SemiBold else FontWeight.Normal, if (sel) Color.White else Muted,
                                Modifier.clip(CircleShape).background(if (sel) Harbour else Color.Transparent).clickable { newestFirst = v }.padding(horizontal = 10.dp, vertical = 5.dp),
                            )
                        }
                    }
                }
            }
            items(timeline) { it ->
                when (it) {
                    is Item.M -> TimelineMessage(it.m, partner)
                    is Item.E -> TimelineEvent(it.e, onChanged)
                }
            }
        }
        StatusScrim()
        photo?.let { start ->
            // Swipe through all the lead's photos; a tap anywhere closes.
            val pager = rememberPagerState(initialPage = start) { photos.size }
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .94f)).clickable { photo = null }) {
                HorizontalPager(pager, Modifier.fillMaxSize(), pageSpacing = 12.dp) { i ->
                    // fillMaxSize, not fillMaxWidth: with an unbounded height, Fit sizes
                    // the box to the bitmap's own height and the photo never grows.
                    RemoteImage(photos[i], Modifier.fillMaxSize(), crop = false, full = true)
                }
                if (photos.size > 1) T(
                    "${pager.currentPage + 1}/${photos.size}", 14, FontWeight.SemiBold, Color.White,
                    Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 20.dp)
                        .clip(CircleShape).background(Color.Black.copy(alpha = .55f)).padding(horizontal = 12.dp, vertical = 5.dp),
                )
            }
        }
    }
}

/** "אצלי" for the person holding the phone, "אצל דודו" for anyone else. */
/**
 * Send this lead's card as a link that opens the one lead with no sign-in. The card
 * is full unless something is ticked off; the server keeps the choice with the link.
 * The history is free text that names the phone, the street and the price, so
 * hiding any of those hides it too.
 */
@Composable
private fun ShareDialog(l: Lead, onDismiss: () -> Unit, onShared: () -> Unit) {
    val api = LocalApi.current
    val share = rememberShareText()
    val scope = rememberCoroutineScope()
    val fields = listOf("contact" to "פרטי הלקוח", "address" to "כתובת", "price" to "מחיר", "photos" to "תמונות", "history" to "היסטוריה")
    var hide by remember { mutableStateOf(setOf<String>()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sentVersion by remember { mutableStateOf(0) }
    val forced = hide.any { it in setOf("contact", "address", "price") }
    val effective = if (forced) hide + "history" else hide
    // Without the customer's details, the server leaves out the photos that show his whole number
    // (and any not checked yet) — say how many, so a card with fewer photos is not a surprise.
    val images = l.messages.filter { it.mediaType == "image" && it.mediaUrl != null }
    val dropped = if ("contact" in effective && "photos" !in effective) images.count { it.phoneShown != "none" && it.phoneShown != "partial" } else 0
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        title = { T("שליחת כרטיס", 18, FontWeight.Bold) },
        text = {
            Column {
                T("קישור שפותח רק את הליד הזה, בלי כניסה. הכרטיס מלא — סמנו מה להוריד.", 14, color = Muted)
                Spacer(Modifier.height(8.dp))
                fields.forEach { (id, label) ->
                    val locked = id == "history" && forced
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                            .clickable(enabled = !locked) { hide = if (id in hide) hide - id else hide + id }.padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(id in effective, onCheckedChange = null, enabled = !locked, colors = CheckboxDefaults.colors(checkedColor = Harbour))
                        Spacer(Modifier.width(4.dp))
                        T("בלי $label", 15)
                        if (locked) T("  · יורדת יחד עם השאר", 12, color = Muted)
                    }
                }
                if (dropped > 0) T(
                    "${if (dropped == images.size) "כל התמונות" else "$dropped מתוך ${images.size} תמונות"} לא ייכנסו לכרטיס — רואים בהן את המספר של הלקוח, או שעוד לא נבדקו.", 12, color = Color(0xFF8A4A0B),
                    modifier = Modifier.padding(top = 8.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFFFFF1DF)).padding(10.dp),
                )
                Spacer(Modifier.height(12.dp))
                T("או כטקסט בוואטסאפ", 13, FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                SendTextButtons("הכרטיס", resetKey = effective.sorted().joinToString(",")) { to ->
                    when (val r = api.sendCardText(l.id, effective.toList(), to)) {
                        is Result.Ok -> { sentVersion++; onShared(); null }
                        is Result.Err -> r.message
                    }
                }
                RecentSends(l.id, sentVersion, onChanged = onShared)
                ClearPreview { sentVersion++; onShared() }
                error?.let { T(it, 13, color = Danger, modifier = Modifier.padding(top = 8.dp)) }
            }
        },
        confirmButton = {
            TextButton(
                {
                    busy = true
                    scope.launch {
                        when (val r = api.createShare(l.id, effective.toList())) {
                            is Result.Ok -> { share(l.title, "${l.title}\n${r.value}"); onShared(); onDismiss() }
                            is Result.Err -> error = r.message
                        }
                        busy = false
                    }
                },
                enabled = !busy,
            ) { Text("שתף קישור", color = Harbour, fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onDismiss) { Text("ביטול", color = Muted) } },
    )
}

/**
 * The two places lead text goes (server: lib/config.ts TEXT_TARGETS): the preview
 * group "קבוצה ריקה" to read it first, and Dudu. Sending to Dudu is in Yaniv's name
 * in a real chat, so the first tap only arms it (it disarms after 4 s) and the
 * second sends. [send] returns an error message, or null when sent. A new
 * [resetKey] (e.g. what to hide) clears the "sent ✓" marks — it would be a new message.
 */
@Composable
private fun SendTextButtons(what: String, resetKey: String = "", send: suspend (to: String) -> String?) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    var sent by remember(resetKey) { mutableStateOf(setOf<String>()) }
    var armed by remember(resetKey) { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(armed) { if (armed) { kotlinx.coroutines.delay(4000); armed = false } }
    fun go(to: String) {
        if (to == "dudu" && !armed) { armed = true; return }
        armed = false
        busy = to
        error = null
        scope.launch {
            val err = send(to)
            busy = null
            if (err != null) error = err else sent = sent + to
        }
    }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                { go("preview") }, enabled = busy == null, modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 10.dp),
            ) { Text(if (busy == "preview") "שולח…" else if ("preview" in sent) "בקבוצה ריקה ✓" else "לקבוצה ריקה (בדיקה)", color = Harbour, fontSize = 13.sp, textAlign = TextAlign.Center) }
            Button(
                { go("dudu") }, enabled = busy == null, modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (armed) Amber else Israel),
            ) {
                Text(
                    when { busy == "dudu" -> "שולח…"; armed -> "לחצו שוב לשליחה"; "dudu" in sent -> "נשלח לדודו ✓"; else -> "שלח את $what לדודו" },
                    color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                )
            }
        }
        T("הפרטים עצמם בתוך ההודעה, בלי קישור. לדודו — מהמספר שלך, בצ׳אט שלכם.", 12, color = Muted, modifier = Modifier.padding(top = 4.dp))
        error?.let { T(it, 13, color = Danger, modifier = Modifier.padding(top = 6.dp)) }
    }
}

/**
 * The report of every open lead, exactly as the server will send it: read it here,
 * send it to the preview group to see it as Dudu will, then send it to Dudu.
 */
@Composable
private fun ReportDialog(onDismiss: () -> Unit) {
    val api = LocalApi.current
    var parts by remember { mutableStateOf<List<String>?>(null) }
    var choices by remember { mutableStateOf(listOf<ReportChoice>()) }
    // null = every open lead.
    var picked by remember { mutableStateOf<Set<Int>?>(null) }
    var picking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var version by remember { mutableStateOf(0) }
    val ids = picked?.sorted()
    val none = picked?.isEmpty() == true
    LaunchedEffect(version, ids) {
        if (none) return@LaunchedEffect
        when (val r = api.report(ids)) {
            is Result.Ok -> { parts = r.value.parts; choices = r.value.choices; error = null }
            is Result.Err -> error = r.message
        }
    }
    fun toggle(id: Int) {
        val next = (picked ?: choices.map { it.id }.toSet()).let { if (id in it) it - id else it + id }
        picked = if (next.size == choices.size) null else next
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        title = { T("דוח לידים", 18, FontWeight.Bold) },
        text = {
            Column {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, Line, RoundedCornerShape(12.dp)).clickable { picking = !picking }.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    T("לידים בדוח: ${picked?.size ?: choices.size} מתוך ${choices.size}", 14, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    T(if (picking) "▲" else "בחירה ▼", 13, color = Muted)
                }
                if (picking) Column(Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState()).padding(top = 4.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 4.dp)) {
                        T("הכל", 13, modifier = Modifier.clip(CircleShape).border(1.dp, Line, CircleShape).clickable { picked = null }.padding(horizontal = 12.dp, vertical = 5.dp))
                        T("אף אחד", 13, modifier = Modifier.clip(CircleShape).border(1.dp, Line, CircleShape).clickable { picked = emptySet() }.padding(horizontal = 12.dp, vertical = 5.dp))
                    }
                    choices.map { it.group }.distinct().forEach { g ->
                        T(g, 11, FontWeight.Bold, Muted, Modifier.padding(top = 6.dp))
                        choices.filter { it.group == g }.forEach { c ->
                            Row(Modifier.fillMaxWidth().clickable { toggle(c.id) }, verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(picked?.contains(c.id) ?: true, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = Harbour))
                                Spacer(Modifier.width(4.dp))
                                T(c.title, 14, maxLines = 1)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                    if (none) T("לא נבחרו לידים.", 13, color = Muted)
                    else {
                        if (parts == null && error == null) T("טוען…", 13, color = Muted)
                        parts?.forEach { p ->
                            T(p, 13, modifier = Modifier.padding(bottom = 8.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFFE7F6E9)).padding(10.dp))
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                error?.let { T(it, 13, color = Danger) }
                if (parts != null && !none && error == null) SendTextButtons("הדוח", resetKey = ids?.joinToString(",") ?: "") { to ->
                    when (val r = api.sendReport(to, ids)) {
                        is Result.Ok -> { version++; null }
                        is Result.Err -> r.message
                    }
                }
                RecentSends(null, version)
                ClearPreview { version++ }
            }
        },
        confirmButton = { TextButton(onDismiss) { Text("סגירה", color = Muted) } },
    )
}

/**
 * Sends made from the app that WhatsApp still lets us delete for everyone (about
 * two days) — [leadId]'s cards, or the reports when null. Delete takes a second
 * tap. A new [refreshKey] reloads the list (after a send).
 */
@Composable
private fun RecentSends(leadId: Int?, refreshKey: Int, onChanged: () -> Unit = {}) {
    val api = LocalApi.current
    val scope = rememberCoroutineScope()
    var sends by remember { mutableStateOf(listOf<SentBatch>()) }
    var version by remember { mutableStateOf(0) }
    var armed by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(leadId, refreshKey, version) { (api.recentSends(leadId) as? Result.Ok)?.let { sends = it.value } }
    LaunchedEffect(armed) { if (armed != null) { kotlinx.coroutines.delay(4000); armed = null } }
    if (sends.isEmpty() && error == null) return
    Column(Modifier.padding(top = 12.dp)) {
        T("נשלחו לאחרונה", 13, FontWeight.Bold)
        sends.forEach { s ->
            Row(
                Modifier.padding(top = 6.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, Line, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    T("${if (s.kind == "report") "דוח" else "כרטיס"} ל${s.to}${if (s.messages > 1) " · ${s.messages} הודעות" else ""}", 14)
                    T("${s.sentBy} · ${short(s.sentAt)}", 11, color = Muted)
                }
                val isArmed = armed == s.batch
                T(
                    when { busy == s.batch -> "מוחק…"; isArmed -> "לחצו שוב"; else -> "מחק" }, 13, FontWeight.SemiBold, if (isArmed) Color.White else Danger,
                    Modifier.clip(CircleShape).background(if (isArmed) Danger else Color.Transparent).border(1.dp, Danger, CircleShape)
                        .clickable(enabled = busy == null) {
                            if (!isArmed) { armed = s.batch; return@clickable }
                            armed = null
                            busy = s.batch
                            error = null
                            scope.launch {
                                when (val r = api.deleteSend(s.batch)) {
                                    is Result.Ok -> { version++; onChanged() }
                                    is Result.Err -> error = r.message
                                }
                                busy = null
                            }
                        }.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
        error?.let { T(it, 13, color = Danger, modifier = Modifier.padding(top = 6.dp)) }
    }
}

/** The board header's pill for [ClearPreview]: two taps, and the outcome shows in the pill for a moment. */
@Composable
private fun HeaderClear() {
    val api = LocalApi.current
    val scope = rememberCoroutineScope()
    var armed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(armed) { if (armed) { delay(4000); armed = false } }
    LaunchedEffect(result) { if (result != null) { delay(6000); result = null } }
    T(
        when { busy -> "מוחק…"; armed -> "לחצו שוב"; else -> result ?: "נקה קבוצה ריקה" }, 13, FontWeight.SemiBold, Color.White,
        Modifier.clip(CircleShape).background(if (armed) Danger else Color.White.copy(alpha = .12f))
            .clickable(enabled = !busy) {
                if (!armed) { armed = true; return@clickable }
                armed = false
                busy = true
                scope.launch {
                    result = when (val r = api.clearPreview()) {
                        is Result.Ok -> if (r.value.deleted == 0 && r.value.failed.isEmpty()) "אין מה למחוק" else "נמחקו ${r.value.deleted}" + if (r.value.failed.isNotEmpty()) " · ${r.value.failed.size} נכשלו" else ""
                        is Result.Err -> "המחיקה נכשלה"
                    }
                    busy = false
                }
            }.padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

/** Delete for everyone every message the app put in קבוצה ריקה. Two taps. */
@Composable
private fun ClearPreview(onDone: () -> Unit = {}) {
    val api = LocalApi.current
    val scope = rememberCoroutineScope()
    var armed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(armed) { if (armed) { delay(4000); armed = false } }
    Column(Modifier.padding(top = 12.dp)) {
        OutlinedButton(
            {
                if (!armed) { armed = true; result = null; return@OutlinedButton }
                armed = false
                busy = true
                scope.launch {
                    result = when (val r = api.clearPreview()) {
                        is Result.Ok -> with(r.value) {
                            if (deleted == 0 && failed.isEmpty()) "אין הודעות של האפליקציה בקבוצה"
                            else "נמחקו $deleted הודעות" + if (failed.isNotEmpty()) " · ${failed.size} לא נמחקו (ישנות מדי)" else ""
                        }
                        is Result.Err -> r.message
                    }
                    busy = false
                    onDone()
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = if (armed) Danger else Color.Transparent),
        ) {
            Text(
                when { busy -> "מוחק…"; armed -> "לחצו שוב — למחוק הכל"; else -> "מחק את כל ההודעות מקבוצה ריקה" },
                color = if (armed) Color.White else Danger, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
            )
        }
        result?.let { T(it, 12, color = Muted, modifier = Modifier.padding(top = 4.dp)) }
    }
}

/** The ball filter for leads nobody has taken yet — not a user id (ids come from OURLEADS_USERS). */
private const val NOBODY = "nobody"

private fun holderLabel(d: BoardData, id: String): String = when (id) {
    d.customer.id -> "אצל ${d.customer.name}"
    d.me.id -> "אצלי"
    else -> "אצל ${d.people.firstOrNull { it.id == id }?.name ?: id}"
}

/** An Israel date [days] from today, "2026-10-09". */
private fun daysFromToday(days: Int): String =
    Clock.System.now().toLocalDateTime(tz).date.plus(days, kotlinx.datetime.DateTimeUnit.DAY).toString()

/**
 * Whose move it is. Passing the ball says "I've done my part — it's yours until you
 * pass it back". It is separate from the status: a lead at פגישה can be in either hands.
 * The customer is the third place: we wait for him until a day, then it is both partners' move.
 */
@Composable
private fun HolderPicker(d: BoardData, l: Lead, busy: Boolean, onCheckBack: (String) -> Unit, onPass: (String?) -> Unit) {
    Surface(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp).fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line)) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                T("הכדור אצל", 14, FontWeight.SemiBold, Ink2, Modifier.padding(horizontal = 6.dp))
                Spacer(Modifier.width(6.dp))
                Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Paper).padding(4.dp)) {
                    (d.people.map { it.id to it.name } + (d.customer.id to d.customer.name) + (null to "אף אחד")).forEach { (id, name) ->
                        val sel = id == l.holder
                        val on = when (id) { null -> Color.White; d.customer.id -> Amber; else -> Harbour }
                        Box(
                            Modifier.weight(1f).clip(RoundedCornerShape(9.dp)).background(if (sel) on else Color.Transparent)
                                .clickable(enabled = !busy && !sel) { onPass(id) }.padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            T(if (id == d.me.id) "$name (אני)" else name, 14, if (sel) FontWeight.Bold else FontWeight.Normal, if (sel) (if (id == null) Ink else Color.White) else Muted)
                        }
                    }
                }
            }
            if (l.holder == d.customer.id) {
                val due = l.checkBackDue
                val fg = if (due) Color.White else Color(0xFF8A4A0B)
                Column(Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (due) Amber else AmberSoft).padding(12.dp)) {
                    T(
                        if (due) "הגיע הזמן לבדוק עם הלקוח — זה אצל שנינו. מי שמדבר איתו לוקח את הכדור."
                        else "מחכים ללקוח. ${l.checkBackAt?.let { "ב${sayDay(it)}" } ?: "בעוד כמה ימים"} זה חוזר לשנינו.",
                        14, FontWeight.SemiBold, fg,
                    )
                    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        T(if (due) "לתת לו עוד:" else "לבדוק איתו:", 13, color = fg.copy(alpha = .85f))
                        listOf(1 to "מחר", 3 to "3 ימים", 7 to "שבוע").forEach { (n, label) ->
                            Spacer(Modifier.width(6.dp))
                            T(
                                label, 13, FontWeight.SemiBold, fg,
                                Modifier.clip(CircleShape).background(if (due) Color.White.copy(alpha = .22f) else Color.White)
                                    .clickable(enabled = !busy) { onCheckBack(daysFromToday(n)) }.padding(horizontal = 12.dp, vertical = 7.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BigAction(icon: ImageVector, label: String, color: Color, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(Color.White).border(1.dp, Line, RoundedCornerShape(18.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(vertical = 14.dp).alpha(if (enabled) 1f else .35f),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(22.dp))
        T(label, 14, FontWeight.SemiBold, color, Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun Rail(dot: Color, size: Dp, top: Dp) {
    Box(Modifier.width(36.dp).fillMaxHeight()) {
        Box(Modifier.align(Alignment.TopCenter).width(1.dp).fillMaxHeight().background(Line))
        Box(Modifier.align(Alignment.TopCenter).padding(top = top).size(size).clip(CircleShape).background(Paper).padding(2.dp).clip(CircleShape).background(dot))
    }
}

@Composable
private fun TimelineMessage(m: Msg, partner: String) {
    val uri = LocalUriHandler.current
    val api = LocalApi.current
    Row(Modifier.padding(start = 6.dp, end = 16.dp).height(IntrinsicSize.Min)) {
        Rail(if (m.fromMe) Israel else Sky, 16.dp, 12.dp)
        Column(
            Modifier.weight(1f).padding(vertical = 5.dp).clip(RoundedCornerShape(16.dp))
                .background(if (m.fromMe) Color(0xFFECF8F3) else Color.White)
                .border(1.dp, if (m.fromMe) Color(0xFFCDEEE0) else Line, RoundedCornerShape(16.dp)).padding(12.dp),
        ) {
            T("${if (m.fromMe) "אני" else partner} · ${short(m.sentAt)} · וואטסאפ", 11, color = Muted)
            if ((m.mediaType == "audio" || m.mediaType == "video") && m.mediaUrl != null) {
                Row(
                    Modifier.padding(top = 6.dp).clip(CircleShape).background(Paper).clickable { uri.openUri(api.base + m.mediaUrl) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.PlayArrow, null, tint = Harbour, modifier = Modifier.size(18.dp))
                    T(if (m.mediaType == "audio") "השמעת ההקלטה" else "צפייה בסרטון", 13, FontWeight.SemiBold, Harbour)
                }
            }
            m.transcript?.let { T("״$it״", 14, color = Ink2, lineHeight = 21, modifier = Modifier.padding(top = 6.dp)) }
            if (m.content.isNotBlank()) T(m.content, 15, lineHeight = 22, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

/** One history line. Long-press opens [EventDialog] to correct it or take it off. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TimelineEvent(e: LeadEvent, onChanged: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    if (open) EventDialog(e, onDismiss = { open = false }, onChanged = onChanged)
    Row(Modifier.padding(start = 6.dp, end = 16.dp).height(IntrinsicSize.Min).combinedClickable(onClick = {}, onLongClick = { open = true })) {
        Rail(Harbour, 14.dp, 8.dp)
        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
            T("${short(e.at)} · ${e.who}${e.editedBy?.let { " · נערך ע״י $it" } ?: ""}", 11, color = Muted)
            e.to?.let {
                Row(Modifier.padding(top = 2.dp)) {
                    e.from?.let { f -> T("$f ← ", 14, color = Muted) }
                    T(it, 14, FontWeight.Bold)
                }
            }
            e.text?.let { T(it, 14, color = Ink2, lineHeight = 21, modifier = Modifier.padding(top = 2.dp)) }
        }
    }
}

/**
 * Correct a history line or take it off the lead. Delete takes a second tap. The
 * server keeps a removed line with who removed it, and marks an edited one —
 * two partners share this history.
 */
@Composable
private fun EventDialog(e: LeadEvent, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val api = LocalApi.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf(e.text ?: "") }
    var armed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(armed) { if (armed) { delay(4000); armed = false } }
    fun run(call: suspend () -> Result<Unit>) {
        busy = true
        error = null
        scope.launch {
            when (val r = call()) {
                is Result.Ok -> { onChanged(); onDismiss() }
                is Result.Err -> error = r.message
            }
            busy = false
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        title = { T("שורה בהיסטוריה", 18, FontWeight.Bold) },
        text = {
            Column {
                T("${short(e.at)} · ${e.who}", 12, color = Muted)
                e.to?.let { T("${e.from?.let { f -> "$f ← " } ?: ""}$it", 14, FontWeight.Bold, modifier = Modifier.padding(top = 4.dp)) }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth(), minLines = 2, maxLines = 6)
                Spacer(Modifier.height(10.dp))
                Button(
                    {
                        if (!armed) armed = true
                        else { armed = false; run { api.deleteEvent(e.id) } }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = if (armed) Danger else Color(0xFFFDE8E8)),
                ) { Text(if (armed) "לחצו שוב למחיקה" else "מחק את השורה", color = if (armed) Color.White else Danger, fontWeight = FontWeight.Bold) }
                error?.let { T(it, 13, color = Danger, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton({ run { api.editEvent(e.id, text.trim()) } }, enabled = !busy && text.isNotBlank() && text.trim() != (e.text ?: "")) {
                Text("שמור", color = Harbour, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = { TextButton(onDismiss) { Text("ביטול", color = Muted) } },
    )
}

// ── Voice ────────────────────────────────────────────────────────────────────
// What was said is always about ONE lead: it is spoken on that lead's card or
// inside that lead, and the server changes nothing else.

@Stable
private class TalkState(val recorder: VoiceRecorder) {
    var recording by mutableStateOf(false)
    var working by mutableStateOf(false)
    var elapsed by mutableStateOf(0)
    var error by mutableStateOf<String?>(null)
}

/** Hold-to-talk about one lead: records while pressed, sends on release. Returns the state and the press modifier. */
@Composable
private fun rememberTalk(leadId: Int, onReply: (CommandReply) -> Unit): Pair<TalkState, Modifier> {
    val api = LocalApi.current
    val scope = rememberCoroutineScope()
    val recorder = rememberVoiceRecorder()
    val st = remember(recorder) { TalkState(recorder) }
    val reply by rememberUpdatedState(onReply)
    var startedAt by remember { mutableStateOf(0L) }
    LaunchedEffect(st.recording) {
        while (st.recording) { st.elapsed = ((Clock.System.now().toEpochMilliseconds() - startedAt) / 1000).toInt(); delay(250) }
    }
    val press = Modifier.pointerInput(st.working, leadId) {
        if (st.working) return@pointerInput
        detectTapGestures(onPress = {
            st.error = null
            if (!recorder.start()) return@detectTapGestures
            startedAt = Clock.System.now().toEpochMilliseconds()
            st.elapsed = 0
            st.recording = true
            tryAwaitRelease()
            st.recording = false
            val rec = recorder.stop()
            if (rec == null) { st.error = "החזיקו את הכפתור לאורך כל המשפט"; return@detectTapGestures }
            st.working = true
            scope.launch {
                when (val r = api.sayAudio(leadId, rec.bytes, rec.fileName, rec.mime)) {
                    is Result.Ok -> reply(r.value)
                    is Result.Err -> st.error = r.message
                }
                st.working = false
            }
        })
    }
    return st to press
}

@Composable
private fun ReplyBubble(r: CommandReply, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().shadow(16.dp, RoundedCornerShape(20.dp))
            .clip(RoundedCornerShape(20.dp)).background(Ink).padding(16.dp),
    ) {
        Row {
            Column(Modifier.weight(1f)) {
                T("״${r.said}״", 13, color = Color.White.copy(alpha = .55f))
                T(r.reply, 15, FontWeight.SemiBold, Color.White, Modifier.padding(top = 4.dp), lineHeight = 21)
            }
            Icon(Icons.Default.Close, "סגירה", tint = Color.White.copy(alpha = .5f), modifier = Modifier.size(22.dp).clickable(onClick = onDismiss))
        }
        r.changes.forEach { c ->
            Row(Modifier.padding(top = 8.dp).clip(CircleShape).background(Color.White.copy(alpha = .1f)).padding(horizontal = 12.dp, vertical = 6.dp)) {
                T(c.title, 13, color = Color.White, maxLines = 1)
                c.to?.let { T("  ← $it", 13, FontWeight.Bold, Amber) }
            }
        }
    }
}

/** The mic, on a lead card and inside a lead: hold it and say what happened with this lead. Red while recording, spinner while it works. */
@Composable
private fun CardTalk(l: Lead, onReply: (CommandReply) -> Unit, onError: (String) -> Unit) {
    val (st, press) = rememberTalk(l.id, onReply)
    val failed = st.error != null || st.recorder.permissionDenied
    // No room for words on a card — the board shows the message.
    LaunchedEffect(st.error, st.recorder.permissionDenied) {
        (st.error ?: if (st.recorder.permissionDenied) "צריך הרשאת מיקרופון" else null)?.let(onError)
    }
    Box(contentAlignment = Alignment.Center) {
        if (st.recording) {
            val inf = rememberInfiniteTransition()
            val k by inf.animateFloat(1f, 1.8f, infiniteRepeatable(tween(1100, easing = LinearOutSlowInEasing)))
            val a by inf.animateFloat(.45f, 0f, infiniteRepeatable(tween(1100, easing = LinearOutSlowInEasing)))
            Box(Modifier.size(46.dp).scale(k).alpha(a).clip(CircleShape).background(Color(0xFFDC2626)))
        }
        Box(
            Modifier.size(46.dp).clip(CircleShape)
                .background(if (st.recording || failed) Color(0xFFDC2626) else Harbour)
                .then(press),
            contentAlignment = Alignment.Center,
        ) {
            if (st.working) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            else Icon(Icons.Default.Mic, "ספרו לי מה קרה", tint = Color.White, modifier = Modifier.size(24.dp))
        }
    }
}

// ── Deal ─────────────────────────────────────────────────────────────────────
private const val VAT = 0.18
private fun net(p: Double, vat: Boolean?) = if (vat == false) p / (1 + VAT) else p
private fun shekel(n: Double): String {
    val r = kotlin.math.round(n).toLong()
    val digits = kotlin.math.abs(r).toString().reversed().chunked(3).joinToString(",").reversed()
    return (if (r < 0) "-" else "") + "₪" + digits
}
private fun margin(d: Deal): Double? =
    if (d.clientPrice == null || d.subPrice == null) null else net(d.clientPrice, d.clientVat) - net(d.subPrice, d.subVat)

/** What the client pays, what the subcontractor gets, and what stays with us (before VAT). */
@Composable
private fun DealSection(deal: Deal, busy: Boolean, onSave: (Deal) -> Unit) {
    val uri = LocalUriHandler.current
    var editing by remember(deal) { mutableStateOf(false) }
    val empty = deal.clientPrice == null && deal.subPrice == null && deal.subName == null
    Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
        when {
            editing -> DealForm(deal, busy, onCancel = { editing = false }) { onSave(it); editing = false }
            empty -> T(
                "+ סגרתם? הוסיפו מחיר ללקוח ולקבלן המשנה", 15, FontWeight.SemiBold, Muted,
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(2.dp, Track, RoundedCornerShape(18.dp))
                    .clickable { editing = true }.padding(vertical = 16.dp, horizontal = 18.dp),
            )
            else -> Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line)) {
                Column {
                    Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) {
                        T("העסקה", 14, FontWeight.Bold, Ink2)
                        Spacer(Modifier.weight(1f))
                        T("עריכה", 14, color = Harbour, modifier = Modifier.clickable { editing = true })
                    }
                    Row(Modifier.height(IntrinsicSize.Min)) {
                        DealSide("מהלקוח", deal.clientPrice, deal.clientVat, Modifier.weight(1f)) {}
                        Box(Modifier.width(1.dp).fillMaxHeight().padding(vertical = 12.dp).background(Line))
                        DealSide("לקבלן המשנה", deal.subPrice, deal.subVat, Modifier.weight(1f)) {
                            deal.subName?.let { T(it, 14, FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp)) }
                            deal.subPhone?.let { p ->
                                Row(Modifier.clickable { uri.openUri("tel:$p") }.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Call, null, tint = Harbour, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    T(prettyPhone(p), 14, color = Harbour)
                                }
                            }
                        }
                    }
                    val m = margin(deal)
                    Row(
                        Modifier.fillMaxWidth().background(if (m == null) Paper else if (m >= 0) Color(0xFFECF8F3) else Color(0xFFFDE8E8))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        T("נשאר לנו  ", 14, color = Ink2)
                        if (m == null) T("— חסר ${if (deal.clientPrice == null) "המחיר ללקוח" else "המחיר לקבלן המשנה"}", 14, color = Muted)
                        else {
                            T(shekel(m), 20, FontWeight.Bold, if (m >= 0) Color(0xFF0B5C47) else Danger)
                            T("  לפני מע״מ", 12, color = Muted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DealSide(title: String, price: Double?, vat: Boolean?, modifier: Modifier, extra: @Composable ColumnScope.() -> Unit) {
    Column(modifier.padding(16.dp)) {
        T(title, 12, color = Muted)
        if (price == null) T("—", 18, color = Muted, modifier = Modifier.padding(top = 2.dp))
        else {
            T(shekel(price), 24, FontWeight.ExtraBold, modifier = Modifier.padding(top = 2.dp))
            T(
                when (vat) { true -> "+ מע״מ"; false -> "כולל מע״מ · ${shekel(net(price, false))} לפני"; else -> "מע״מ לא צוין" },
                12, color = Muted,
            )
        }
        extra()
    }
}

@Composable
private fun DealForm(deal: Deal, busy: Boolean, onCancel: () -> Unit, onSave: (Deal) -> Unit) {
    fun str(d: Double?) = d?.let { kotlin.math.round(it).toLong().toString() } ?: ""
    var cp by remember { mutableStateOf(str(deal.clientPrice)) }
    var cv by remember { mutableStateOf(deal.clientVat ?: true) }
    var sn by remember { mutableStateOf(deal.subName ?: "") }
    var sph by remember { mutableStateOf(deal.subPhone ?: "") }
    var sp by remember { mutableStateOf(str(deal.subPrice)) }
    var sv by remember { mutableStateOf(deal.subVat ?: true) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(2.dp, Harbour2.copy(alpha = .4f), RoundedCornerShape(18.dp)).padding(16.dp),
    ) {
        T("העסקה", 16, FontWeight.Bold)
        T("מול הלקוח", 13, FontWeight.SemiBold, Ink2, Modifier.padding(top = 12.dp, bottom = 6.dp))
        Field(cp, { cp = it.filter(Char::isDigit) }, "₪ סכום", numeric = true)
        VatToggle(cv) { cv = it }
        HorizontalDivider(color = Line, modifier = Modifier.padding(vertical = 14.dp))
        T("מול קבלן המשנה", 13, FontWeight.SemiBold, Ink2, Modifier.padding(bottom = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) { Field(sn, { sn = it }, "שם") }
            Box(Modifier.weight(1f)) { Field(sph, { sph = it }, "טלפון", numeric = true) }
        }
        Spacer(Modifier.height(8.dp))
        Field(sp, { sp = it.filter(Char::isDigit) }, "₪ סכום", numeric = true)
        VatToggle(sv) { sv = it }
        Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            T(
                "שמור עסקה", 15, FontWeight.SemiBold, Color.White,
                Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(if (busy) Harbour.copy(alpha = .4f) else Harbour)
                    .clickable(enabled = !busy) {
                        onSave(
                            Deal(
                                clientPrice = cp.toDoubleOrNull(), clientVat = cv,
                                subName = sn.ifBlank { null }, subPhone = sph.filter(Char::isDigit).ifBlank { null },
                                subPrice = sp.toDoubleOrNull(), subVat = sv,
                            ),
                        )
                    }.padding(vertical = 14.dp).wrapContentWidth(Alignment.CenterHorizontally),
            )
            T(
                "ביטול", 15, color = Muted,
                modifier = Modifier.clip(RoundedCornerShape(14.dp)).border(1.dp, Line, RoundedCornerShape(14.dp))
                    .clickable(onClick = onCancel).padding(horizontal = 20.dp, vertical = 14.dp),
            )
        }
    }
}

/** A detail row that becomes a text box when tapped. Saving an empty box clears the field. */
@Composable
private fun EditFact(k: String, v: String?, busy: Boolean, onSave: (String?) -> Unit) {
    var draft by remember(v) { mutableStateOf<String?>(null) }
    val d = draft
    if (d == null) {
        Row(
            Modifier.fillMaxWidth().clickable { draft = v ?: "" }.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            T(k, 14, color = Muted, modifier = Modifier.width(84.dp))
            T(v ?: "—", 14, color = if (v == null) Muted else Ink2, modifier = Modifier.weight(1f))
            T("שנה", 12, color = Muted)
        }
        return
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
        T(k, 13, color = Muted, modifier = Modifier.padding(bottom = 6.dp))
        Field(d, { draft = it }, k)
        Row(Modifier.padding(top = 8.dp)) {
            val next = d.trim().ifEmpty { null }
            T(
                "שמור", 15, FontWeight.SemiBold, Color.White,
                Modifier.clip(RoundedCornerShape(12.dp)).background(if (busy) Harbour.copy(alpha = .35f) else Harbour)
                    .clickable(enabled = !busy) { if (next != v) onSave(next) else draft = null }
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            )
            Spacer(Modifier.width(8.dp))
            T(
                "ביטול", 15, color = Ink2,
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, Line, RoundedCornerShape(12.dp))
                    .clickable { draft = null }.padding(horizontal = 16.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun Field(value: String, onChange: (String) -> Unit, hint: String, numeric: Boolean = false) {
    BasicTextField(
        value, onChange,
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, Line, RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        textStyle = LocalTextStyle.current.copy(fontSize = 17.sp, fontWeight = if (numeric) FontWeight.SemiBold else FontWeight.Normal),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) androidx.compose.ui.text.input.KeyboardType.Number else androidx.compose.ui.text.input.KeyboardType.Text),
        decorationBox = { inner -> if (value.isEmpty()) T(hint, 16, color = Muted); inner() },
    )
}

@Composable
private fun VatToggle(plus: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.padding(top = 8.dp).clip(CircleShape).background(Paper).padding(4.dp)) {
        listOf(true to "+ מע״מ", false to "כולל מע״מ").forEach { (v, label) ->
            val sel = v == plus
            T(
                label, 14, if (sel) FontWeight.SemiBold else FontWeight.Normal, if (sel) Ink else Muted,
                Modifier.clip(CircleShape).background(if (sel) Color.White else Color.Transparent)
                    .clickable { onChange(v) }.padding(horizontal = 14.dp, vertical = 7.dp),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DealLine(d: Deal) {
    if (d.clientPrice == null && d.subPrice == null) return
    val m = margin(d)
    FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        d.clientPrice?.let { T("לקוח ${shekel(it)}", 12, FontWeight.SemiBold, Ink2, Modifier.clip(RoundedCornerShape(6.dp)).background(Paper).padding(horizontal = 8.dp, vertical = 2.dp)) }
        d.subPrice?.let { T("${d.subName ?: "קבלן משנה"} ${shekel(it)}", 12, FontWeight.SemiBold, Ink2, Modifier.clip(RoundedCornerShape(6.dp)).background(Paper).padding(horizontal = 8.dp, vertical = 2.dp)) }
        m?.let {
            T("נשאר ${shekel(it)}", 12, FontWeight.Bold, if (it >= 0) Color(0xFF0B5C47) else Danger,
                Modifier.clip(RoundedCornerShape(6.dp)).background(if (it >= 0) Color(0xFFDEF5EC) else Color(0xFFFDE8E8)).padding(horizontal = 8.dp, vertical = 2.dp))
        }
    }
}

// ── Calendar ─────────────────────────────────────────────────────────────────
// Two colours, two kinds of commitment: GREEN = a meeting with a customer we have no
// contract with (one moment), RED = the working days of a job with a contract (a span).
private val MeetGreen = Color(0xFF16A34A)
private val MeetInk = Color(0xFF166534)
private val MeetSoft = Color(0xFFDCFCE7)
private val WorkRed = Color(0xFFDC2626)
private val WorkInk = Color(0xFF991B1B)
private val WorkSoft = Color(0xFFFEE2E2)
private val HEB_DAYS = listOf("ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת")
private val HEB_MONTHS = listOf("ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר")

private fun day(s: String): kotlinx.datetime.LocalDate? = runCatching { kotlinx.datetime.LocalDate.parse(s.take(10)) }.getOrNull()
/** Sunday = 0, as the week runs in Israel. */
private fun kotlinx.datetime.LocalDate.sundayIndex() = (dayOfWeek.ordinal + 1) % 7
private fun sayDay(s: String): String = day(s)?.let { "${HEB_DAYS[it.sundayIndex()]} ${it.dayOfMonth}.${it.monthNumber}" } ?: s

private sealed class CalEntry(val lead: Lead) {
    class Meeting(lead: Lead, val time: String) : CalEntry(lead)
    class Work(lead: Lead, val first: Boolean, val last: Boolean, val start: String, val end: String) : CalEntry(lead)
}

private fun entriesByDay(leads: List<Lead>): Map<kotlinx.datetime.LocalDate, List<CalEntry>> {
    val map = mutableMapOf<kotlinx.datetime.LocalDate, MutableList<CalEntry>>()
    for (l in leads) {
        if (l.status == "removed") continue
        l.meetingAt?.let { m -> day(m)?.let { map.getOrPut(it) { mutableListOf() }.add(CalEntry.Meeting(l, m.drop(11).take(5))) } }
        val s = l.workStart?.let(::day) ?: continue
        val e = l.workEnd?.let(::day)?.takeIf { it >= s } ?: s
        var d = s
        while (d <= e) {
            map.getOrPut(d) { mutableListOf() }.add(CalEntry.Work(l, d == s, d == e, l.workStart, (l.workEnd ?: l.workStart)))
            d = d.plus(1, kotlinx.datetime.DateTimeUnit.DAY)
        }
    }
    return map.mapValues { (_, v) -> v.sortedWith(compareBy({ it !is CalEntry.Work }, { (it as? CalEntry.Meeting)?.time ?: "" })) }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CalendarScreen(d: BoardData, leads: List<Lead>, header: @Composable () -> Unit, onOpen: (Int) -> Unit) {
    val today = Clock.System.now().toLocalDateTime(tz).date
    var month by remember { mutableStateOf(kotlinx.datetime.LocalDate(today.year, today.monthNumber, 1)) }
    var selected by remember { mutableStateOf(today) }
    val byDay = remember(leads) { entriesByDay(leads) }
    val cells = buildList<kotlinx.datetime.LocalDate?> {
        repeat(month.sundayIndex()) { add(null) }
        var x = month
        while (x.monthNumber == month.monthNumber) { add(x); x = x.plus(1, kotlinx.datetime.DateTimeUnit.DAY) }
        while (size % 7 != 0) add(null)
    }
    val upcoming = byDay.entries.filter { it.key >= today }.sortedBy { it.key }
        .flatMap { (k, v) -> v.filter { it is CalEntry.Meeting || (it as CalEntry.Work).first }.map { k to it } }.take(6)

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item { header() }
        item {
            Surface(Modifier.padding(16.dp).fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line)) {
                Column {
                    Row(Modifier.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        T("›", 24, modifier = Modifier.clip(CircleShape).clickable { month = month.minus(1, kotlinx.datetime.DateTimeUnit.MONTH) }.padding(horizontal = 14.dp, vertical = 2.dp))
                        T("${HEB_MONTHS[month.monthNumber - 1]} ${month.year}", 18, FontWeight.ExtraBold, modifier = Modifier.widthIn(min = 130.dp).wrapContentWidth(Alignment.CenterHorizontally))
                        T("‹", 24, modifier = Modifier.clip(CircleShape).clickable { month = month.plus(1, kotlinx.datetime.DateTimeUnit.MONTH) }.padding(horizontal = 14.dp, vertical = 2.dp))
                        Spacer(Modifier.weight(1f))
                        T("היום", 14, modifier = Modifier.clip(CircleShape).border(1.dp, Line, CircleShape)
                            .clickable { month = kotlinx.datetime.LocalDate(today.year, today.monthNumber, 1); selected = today }.padding(horizontal = 12.dp, vertical = 4.dp))
                    }
                    Row(Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(9.dp).clip(CircleShape).background(MeetGreen)); T("  פגישה (לפני חוזה)", 12, color = Muted)
                        Spacer(Modifier.width(14.dp))
                        Box(Modifier.width(18.dp).height(9.dp).clip(RoundedCornerShape(2.dp)).background(WorkRed)); T("  עבודה (יש חוזה)", 12, color = Muted)
                    }
                    HorizontalDivider(color = Line)
                    Row { listOf("א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳").forEach { T(it, 11, color = Muted, modifier = Modifier.weight(1f).padding(vertical = 6.dp).wrapContentWidth(Alignment.CenterHorizontally)) } }
                    cells.chunked(7).forEach { week ->
                        HorizontalDivider(color = Line)
                        Row(Modifier.height(IntrinsicSize.Min)) {
                            week.forEach { cell ->
                                val es = cell?.let { byDay[it] } ?: emptyList()
                                val sel = cell == selected
                                Column(
                                    Modifier.weight(1f).heightIn(min = 64.dp).fillMaxHeight()
                                        .background(if (cell == null) Paper.copy(alpha = .6f) else if (sel) Color(0xFFEEF6FC) else Color.White)
                                        .then(if (cell != null) Modifier.clickable { selected = cell } else Modifier).padding(vertical = 3.dp),
                                ) {
                                    if (cell != null) {
                                        val isToday = cell == today
                                        Box(
                                            Modifier.padding(start = 3.dp).size(22.dp).clip(CircleShape).background(if (isToday) Harbour else Color.Transparent),
                                            contentAlignment = Alignment.Center,
                                        ) { T("${cell.dayOfMonth}", 12, if (isToday || sel) FontWeight.Bold else FontWeight.Normal, if (isToday) Color.White else Ink2) }
                                        es.take(3).forEach { e ->
                                            when (e) {
                                                is CalEntry.Work -> Box(
                                                    Modifier.padding(top = 2.dp).fillMaxWidth()
                                                        .padding(start = if (e.first) 2.dp else 0.dp, end = if (e.last) 2.dp else 0.dp)
                                                        .height(14.dp)
                                                        .clip(RoundedCornerShape(topStart = if (e.first) 5.dp else 0.dp, bottomStart = if (e.first) 5.dp else 0.dp, topEnd = if (e.last) 5.dp else 0.dp, bottomEnd = if (e.last) 5.dp else 0.dp))
                                                        .background(WorkRed),
                                                ) { if (e.first) T(e.lead.title.substringBefore("–").trim(), 9, FontWeight.SemiBold, Color.White, Modifier.padding(horizontal = 3.dp), maxLines = 1) }
                                                is CalEntry.Meeting -> T(
                                                    e.time, 9, FontWeight.Bold, MeetInk,
                                                    Modifier.padding(top = 2.dp, start = 2.dp, end = 2.dp).fillMaxWidth().clip(RoundedCornerShape(5.dp)).background(MeetSoft).padding(horizontal = 3.dp),
                                                    maxLines = 1,
                                                )
                                            }
                                        }
                                        if (es.size > 3) T("+${es.size - 3}", 9, color = Muted, modifier = Modifier.padding(start = 3.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        item { T(if (selected == today) "היום" else "${HEB_DAYS[selected.sundayIndex()]} ${selected.dayOfMonth}.${selected.monthNumber}", 13, FontWeight.Bold, Ink2, Modifier.padding(start = 18.dp, bottom = 6.dp)) }
        val dayEs = byDay[selected].orEmpty()
        if (dayEs.isEmpty()) item {
            T("אין כלום ביום הזה.", 14, color = Muted, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, Line, RoundedCornerShape(12.dp)).padding(14.dp))
        }
        items(dayEs) { CalEntryRow(it, null) { onOpen(it.lead.id) } }
        if (upcoming.isNotEmpty()) {
            item { T("הקרובים", 13, FontWeight.Bold, Ink2, Modifier.padding(start = 18.dp, top = 18.dp, bottom = 6.dp)) }
            items(upcoming) { (k, e) -> CalEntryRow(e, k) { onOpen(e.lead.id) } }
        }
    }
}

@Composable
private fun CalEntryRow(e: CalEntry, dayOf: kotlinx.datetime.LocalDate?, onClick: () -> Unit) {
    val meeting = e is CalEntry.Meeting
    Row(
        Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp))
            .background(Color.White).border(1.dp, Line, RoundedCornerShape(14.dp)).clickable(onClick = onClick),
    ) {
        Box(Modifier.width(5.dp).fillMaxHeight().background(if (meeting) MeetGreen else WorkRed))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val label = when (e) {
                    is CalEntry.Meeting -> "פגישה" + (dayOf?.let { " · ${HEB_DAYS[it.sundayIndex()]} ${it.dayOfMonth}.${it.monthNumber}" } ?: "") + " · ${e.time}"
                    is CalEntry.Work -> "עבודה · ${sayDay(e.start)}" + if (e.end != e.start) " – ${sayDay(e.end)}" else ""
                }
                T(label, 12, FontWeight.Bold, if (meeting) MeetInk else WorkInk)
                Spacer(Modifier.weight(1f))
                Box(Modifier.size(20.dp).clip(CircleShape).background(partnerColor(e.lead.source)), contentAlignment = Alignment.Center) {
                    T(partnerInitial(e.lead.source), 10, FontWeight.Bold, Color.White)
                }
            }
            T(e.lead.title, 15, FontWeight.SemiBold, modifier = Modifier.padding(top = 2.dp), maxLines = 1)
            val sub = listOfNotNull(e.lead.customerName, e.lead.address ?: e.lead.city).joinToString(" · ")
            if (sub.isNotEmpty()) T(sub, 13, color = Muted, maxLines = 1)
        }
    }
}

/** Put a lead on the calendar: green meeting (date + time), red working days (start–end). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleSection(l: Lead, busy: Boolean, onSave: (Map<String, String?>) -> Unit) {
    var pick by remember { mutableStateOf<String?>(null) } // "meetDate" | "meetTime" | "workRange"
    var pendingDate by remember { mutableStateOf<String?>(null) }
    Surface(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp).fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line)) {
        Column(Modifier.padding(12.dp)) {
            T("ביומן", 14, FontWeight.Bold, Ink2, Modifier.padding(start = 4.dp, bottom = 8.dp))
            ScheduleRow(
                "פגישה", "לקוח שעוד אין איתו חוזה", MeetGreen, MeetInk, Color(0xFFF0FDF4),
                l.meetingAt?.let { "${sayDay(it)} ${it.drop(11).take(5)}" },
                if (l.meetingAt == null) "קבע פגישה" else "שנה", busy,
                onEdit = { pick = "meetDate" }, onClear = if (l.meetingAt != null) ({ onSave(mapOf("meetingAt" to null)) }) else null,
            )
            Spacer(Modifier.height(8.dp))
            ScheduleRow(
                "ימי עבודה", "נסגר חוזה", WorkRed, WorkInk, Color(0xFFFEF2F2),
                l.workStart?.let { s -> sayDay(s) + (l.workEnd?.takeIf { it != s }?.let { " – ${sayDay(it)}" } ?: "") },
                if (l.workStart == null) "קבע ימי עבודה" else "שנה", busy,
                onEdit = { pick = "workRange" }, onClear = if (l.workStart != null) ({ onSave(mapOf("workStart" to null, "workEnd" to null)) }) else null,
            )
        }
    }
    // Pickers in the calendar's own colours: green for a meeting, red for working days.
    val meetColors = DatePickerDefaults.colors(
        containerColor = Color.White, selectedDayContainerColor = MeetGreen, todayDateBorderColor = MeetGreen,
        todayContentColor = MeetInk, headlineContentColor = MeetInk, selectedYearContainerColor = MeetGreen,
    )
    val workColors = DatePickerDefaults.colors(
        containerColor = Color.White, selectedDayContainerColor = WorkRed, dayInSelectionRangeContainerColor = WorkSoft,
        dayInSelectionRangeContentColor = WorkInk, todayDateBorderColor = WorkRed, todayContentColor = WorkInk,
        headlineContentColor = WorkInk, selectedYearContainerColor = WorkRed,
    )
    fun millisOf(s: String?): Long? = s?.let(::day)?.atStartOfDayIn(TimeZone.UTC)?.toEpochMilliseconds()
    fun dateOf(ms: Long): String = Instant.fromEpochMilliseconds(ms).toLocalDateTime(TimeZone.UTC).date.toString()

    when (pick) {
        "meetDate" -> {
            val st = rememberDatePickerState(initialSelectedDateMillis = millisOf(l.meetingAt) ?: Clock.System.now().toEpochMilliseconds())
            DatePickerDialog(
                onDismissRequest = { pick = null },
                confirmButton = { TextButton({ st.selectedDateMillis?.let { pendingDate = dateOf(it); pick = "meetTime" } }) { Text("המשך לשעה", color = MeetInk, fontWeight = FontWeight.Bold) } },
                dismissButton = { TextButton({ pick = null }) { Text("ביטול", color = Muted) } },
                colors = meetColors,
            ) { DatePicker(st, colors = meetColors, title = { T("יום הפגישה", 16, FontWeight.Bold, modifier = Modifier.padding(start = 24.dp, top = 16.dp)) }, showModeToggle = false) }
        }
        "meetTime" -> {
            val cur = l.meetingAt?.drop(11)?.take(5)?.split(":")
            val st = rememberTimePickerState(initialHour = cur?.getOrNull(0)?.toIntOrNull() ?: 9, initialMinute = cur?.getOrNull(1)?.toIntOrNull() ?: 0, is24Hour = true)
            AlertDialog(
                onDismissRequest = { pick = null },
                title = { T("שעת הפגישה · ${pendingDate?.let(::sayDay) ?: ""}", 16, FontWeight.Bold) },
                text = {
                    TimePicker(
                        st,
                        colors = TimePickerDefaults.colors(
                            clockDialColor = MeetSoft, selectorColor = MeetGreen,
                            timeSelectorSelectedContainerColor = MeetSoft, timeSelectorSelectedContentColor = MeetInk,
                        ),
                    )
                },
                containerColor = Color.White,
                confirmButton = { TextButton({ onSave(mapOf("meetingAt" to "${pendingDate}T${two(st.hour)}:${two(st.minute)}")); pick = null }) { Text("שמור פגישה", color = MeetInk, fontWeight = FontWeight.Bold) } },
                dismissButton = { TextButton({ pick = null }) { Text("ביטול", color = Muted) } },
            )
        }
        "workRange" -> {
            val st = rememberDateRangePickerState(initialSelectedStartDateMillis = millisOf(l.workStart), initialSelectedEndDateMillis = millisOf(l.workEnd))
            DatePickerDialog(
                onDismissRequest = { pick = null },
                confirmButton = {
                    TextButton(
                        {
                            val s = st.selectedStartDateMillis ?: return@TextButton
                            val e = st.selectedEndDateMillis ?: s
                            onSave(mapOf("workStart" to dateOf(s), "workEnd" to dateOf(e))); pick = null
                        },
                        enabled = st.selectedStartDateMillis != null,
                    ) { Text("שמור ימי עבודה", color = WorkInk, fontWeight = FontWeight.Bold) }
                },
                dismissButton = { TextButton({ pick = null }) { Text("ביטול", color = Muted) } },
                colors = workColors,
            ) {
                DateRangePicker(
                    st, Modifier.height(480.dp), colors = workColors,
                    title = { T("ימי העבודה — בחרו יום התחלה ויום סיום", 15, FontWeight.Bold, modifier = Modifier.padding(start = 24.dp, top = 16.dp)) },
                    showModeToggle = false,
                )
            }
        }
    }
}

@Composable
private fun ScheduleRow(
    title: String, hint: String, accent: Color, ink: Color, soft: Color, value: String?, action: String, busy: Boolean,
    onEdit: () -> Unit, onClear: (() -> Unit)?,
) {
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp)).background(soft),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(accent))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                T(title, 15, FontWeight.SemiBold, ink)
                T("  $hint", 11, color = ink.copy(alpha = .65f))
            }
            T(value ?: "—", 16, FontWeight.Bold, if (value != null) ink else Muted, Modifier.padding(top = 2.dp))
        }
        if (onClear != null) T("הסר", 13, color = Muted, modifier = Modifier.clip(CircleShape).clickable(enabled = !busy, onClick = onClear).padding(horizontal = 10.dp, vertical = 6.dp))
        T(
            action, 14, FontWeight.SemiBold, Color.White,
            Modifier.padding(end = 10.dp).clip(CircleShape).background(if (busy) accent.copy(alpha = .4f) else accent)
                .clickable(enabled = !busy, onClick = onEdit).padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}
