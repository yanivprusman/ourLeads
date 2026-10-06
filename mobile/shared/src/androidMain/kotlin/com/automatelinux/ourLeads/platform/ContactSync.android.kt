package com.automatelinux.ourLeads.platform

import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.automatelinux.ourLeads.data.Lead
import com.automatelinux.ourLeads.data.SourceDef
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Every contact this app writes carries a website row "ourleads://lead/<id>". That is how a
 * lead finds its own contact again — across reinstalls, and from the dev and prod builds alike —
 * without touching the sync adapter's columns (SOURCE_ID belongs to Google's sync).
 */
private const val MARK = "ourleads://lead/"
private const val GROUP = "ourLeads"

private class AndroidContactSync(
    private val context: Context,
    private val askPermission: () -> Unit,
) : ContactSync {
    private val prefs = context.getSharedPreferences("ourleads_contacts", Context.MODE_PRIVATE)
    private val resolver: ContentResolver = context.contentResolver
    private val lock = Mutex()
    private var askedThisRun = false
    override var problem by mutableStateOf<String?>(null)

    private val permitted get() = listOf(Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS)
        .all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

    /**
     * The phone's own account: contacts that never leave the device (Samsung calls it "Phone").
     * It has to be named — on Android 16 a contact inserted with no account is moved into the
     * default account, which on this phone is Google. Before Android 15 there is no API for it,
     * and "no account" is the device-local account itself.
     */
    private val accountName: String? = if (Build.VERSION.SDK_INT >= 35) ContactsContract.RawContacts.getLocalAccountName(context) else null
    private val accountType: String? = if (Build.VERSION.SDK_INT >= 35) ContactsContract.RawContacts.getLocalAccountType(context) else null

    /** Startup: walk through whatever is missing, unless the user already said no. */
    fun begin() {
        if (!permitted && prefs.getBoolean("declined", false)) { problem = NO_PERMISSION; return }
        next()
    }

    override fun setUp() {
        prefs.edit().putBoolean("declined", false).apply()
        // Asked once already and refused: Android won't show the dialog again, only Settings can grant it.
        if (!permitted && askedThisRun) {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return
        }
        next()
    }

    private fun next() {
        when {
            !permitted -> { askedThisRun = true; askPermission() }
            else -> problem = null
        }
    }

    fun onPermission(granted: Boolean) {
        if (granted) next() else { prefs.edit().putBoolean("declined", true).apply(); problem = NO_PERMISSION }
    }

    override suspend fun sync(leads: List<Lead>, sources: List<SourceDef>) {
        if (!permitted) { problem = NO_PERMISSION; return }
        lock.withLock {
            withContext(Dispatchers.IO) {
                try {
                    val group = groupId()
                    for (lead in leads) save(lead, sources, group)
                    problem = null
                } catch (e: Exception) {
                    problem = "שמירת אנשי קשר נכשלה: ${e.message ?: e.javaClass.simpleName}"
                }
            }
        }
    }

    private fun save(lead: Lead, sources: List<SourceDef>, group: Long) {
        val phones = lead.phones.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (phones.isEmpty()) return
        val displayName = lead.customerName?.takeIf { it.isNotBlank() } ?: lead.title
        val company = "ourLeads · " + (sources.firstOrNull { it.id == lead.source }?.label ?: lead.source)
        val job = lead.trade?.takeIf { it.isNotBlank() } ?: lead.title
        val note = listOfNotNull(lead.title, listOfNotNull(lead.address, lead.city).joinToString(", ").ifBlank { null }, "ליד #${lead.id}")
            .joinToString("\n")
        val fp = listOf(displayName, company, job, note, phones.joinToString(",")).joinToString("\u0001")
        val fpKey = "fp_${lead.id}"
        val saved = prefs.getString(fpKey, null)
        if (saved == fp) return

        val raw = ownRawContact(lead.id)
        if (raw == null && saved != null) return // we saved it once and the user deleted it — that stands
        // A number the phone already knows belongs to whoever saved it; never duplicate or rename it.
        val newPhones = phones.filter { (raw == null || !isOn(raw, it)) && !known(it) }

        val ops = ArrayList<ContentProviderOperation>()
        if (raw == null) {
            if (newPhones.isEmpty()) { prefs.edit().putString(fpKey, fp).apply(); return }
            ops += ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
                .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, accountName)
                .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, accountType)
                .build()
            fun row(mime: String) = ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
                .withValue(ContactsContract.Data.MIMETYPE, mime)
            ops += row(CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE).withValue(CommonDataKinds.StructuredName.DISPLAY_NAME, displayName).build()
            ops += row(CommonDataKinds.Organization.CONTENT_ITEM_TYPE)
                .withValue(CommonDataKinds.Organization.COMPANY, company).withValue(CommonDataKinds.Organization.TITLE, job).build()
            ops += row(CommonDataKinds.Note.CONTENT_ITEM_TYPE).withValue(CommonDataKinds.Note.NOTE, note).build()
            ops += row(CommonDataKinds.Website.CONTENT_ITEM_TYPE)
                .withValue(CommonDataKinds.Website.URL, MARK + lead.id).withValue(CommonDataKinds.Website.TYPE, CommonDataKinds.Website.TYPE_OTHER).build()
            ops += row(CommonDataKinds.GroupMembership.CONTENT_ITEM_TYPE).withValue(CommonDataKinds.GroupMembership.GROUP_ROW_ID, group).build()
            for (p in newPhones) ops += row(CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(CommonDataKinds.Phone.NUMBER, p).withValue(CommonDataKinds.Phone.TYPE, CommonDataKinds.Phone.TYPE_MOBILE).build()
        } else {
            // The lead changed (a name came in, a phone was added): bring our own contact up to date.
            fun put(mime: String, values: Map<String, String>) {
                ops += ContentProviderOperation.newDelete(ContactsContract.Data.CONTENT_URI)
                    .withSelection("${ContactsContract.Data.RAW_CONTACT_ID}=? AND ${ContactsContract.Data.MIMETYPE}=?", arrayOf(raw.toString(), mime)).build()
                ops += ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                    .withValue(ContactsContract.Data.RAW_CONTACT_ID, raw).withValue(ContactsContract.Data.MIMETYPE, mime)
                    .apply { values.forEach { (k, v) -> withValue(k, v) } }.build()
            }
            put(CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE, mapOf(CommonDataKinds.StructuredName.DISPLAY_NAME to displayName))
            put(CommonDataKinds.Organization.CONTENT_ITEM_TYPE, mapOf(CommonDataKinds.Organization.COMPANY to company, CommonDataKinds.Organization.TITLE to job))
            put(CommonDataKinds.Note.CONTENT_ITEM_TYPE, mapOf(CommonDataKinds.Note.NOTE to note))
            for (p in newPhones) ops += ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
                .withValue(ContactsContract.Data.RAW_CONTACT_ID, raw)
                .withValue(ContactsContract.Data.MIMETYPE, CommonDataKinds.Phone.CONTENT_ITEM_TYPE)
                .withValue(CommonDataKinds.Phone.NUMBER, p).withValue(CommonDataKinds.Phone.TYPE, CommonDataKinds.Phone.TYPE_MOBILE).build()
        }
        val result = resolver.applyBatch(ContactsContract.AUTHORITY, ops)
        if (raw == null) assertOnPhone(result[0].uri!!)
        prefs.edit().putString(fpKey, fp).apply()
    }

    /** The raw contact this app wrote for the lead, if it still exists. */
    private fun ownRawContact(leadId: Int): Long? {
        val ids = resolver.query(
            ContactsContract.Data.CONTENT_URI, arrayOf(ContactsContract.Data.RAW_CONTACT_ID),
            "${ContactsContract.Data.MIMETYPE}=? AND ${CommonDataKinds.Website.URL}=?",
            arrayOf(CommonDataKinds.Website.CONTENT_ITEM_TYPE, MARK + leadId), null,
        )?.use { c -> buildList<Long> { while (c.moveToNext()) add(c.getLong(0)) } } ?: return null
        return ids.firstOrNull { id ->
            resolver.query(
                ContactsContract.RawContacts.CONTENT_URI, arrayOf(ContactsContract.RawContacts._ID),
                "${ContactsContract.RawContacts._ID}=? AND ${ContactsContract.RawContacts.DELETED}=0", arrayOf(id.toString()), null,
            )?.use { it.count > 0 } == true
        }
    }

    /** Any contact on the phone, in any account, already has this number. */
    private fun known(phone: String): Boolean =
        resolver.query(
            Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phone)),
            arrayOf(ContactsContract.PhoneLookup._ID), null, null, null,
        )?.use { it.count > 0 } == true

    private fun isOn(raw: Long, phone: String): Boolean {
        val digits = phone.filter { it.isDigit() }.takeLast(9)
        return resolver.query(
            ContactsContract.Data.CONTENT_URI, arrayOf(CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.Data.RAW_CONTACT_ID}=? AND ${ContactsContract.Data.MIMETYPE}=?",
            arrayOf(raw.toString(), CommonDataKinds.Phone.CONTENT_ITEM_TYPE), null,
        )?.use { c -> generateSequence { if (c.moveToNext()) c.getString(0) else null }.any { it.filter(Char::isDigit).takeLast(9) == digits } } == true
    }

    /**
     * The provider may quietly put a contact somewhere other than where it was asked to (see
     * [accountType]). Customer numbers must not end up in a cloud account, so a contact that
     * landed anywhere but the phone is removed and the sync stops with the reason.
     */
    private fun assertOnPhone(rawUri: Uri) {
        val landed = resolver.query(rawUri, arrayOf(ContactsContract.RawContacts.ACCOUNT_TYPE), null, null, null)
            ?.use { if (it.moveToFirst()) it.getString(0) else null }
        if (landed == accountType) return
        resolver.delete(rawUri.buildUpon().appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true").build(), null, null)
        error("אנדרואיד שמר בחשבון $landed ולא בטלפון")
    }

    private fun accountWhere(name: String, type: String): Pair<String, Array<String>> =
        if (accountName == null || accountType == null) "$name IS NULL AND $type IS NULL" to emptyArray()
        else "$name=? AND $type=?" to arrayOf(accountName, accountType)

    /** The "ourLeads" label on the phone account, so the leads are one filter away in Contacts. */
    private fun groupId(): Long {
        val (where, args) = accountWhere(ContactsContract.Groups.ACCOUNT_NAME, ContactsContract.Groups.ACCOUNT_TYPE)
        resolver.query(
            ContactsContract.Groups.CONTENT_URI, arrayOf(ContactsContract.Groups._ID),
            "$where AND ${ContactsContract.Groups.TITLE}=? AND ${ContactsContract.Groups.DELETED}=0",
            args + GROUP, null,
        )?.use { if (it.moveToFirst()) return it.getLong(0) }
        val uri = resolver.insert(ContactsContract.Groups.CONTENT_URI, android.content.ContentValues().apply {
            put(ContactsContract.Groups.ACCOUNT_NAME, accountName)
            put(ContactsContract.Groups.ACCOUNT_TYPE, accountType)
            put(ContactsContract.Groups.TITLE, GROUP)
            put(ContactsContract.Groups.GROUP_VISIBLE, 1)
        }) ?: error("could not create the $GROUP label")
        return uri.lastPathSegment!!.toLong()
    }

    companion object {
        const val NO_PERMISSION = "אין הרשאה לאנשי קשר · הקש להפעלה"
    }
}

@Composable
actual fun rememberContactSync(): ContactSync {
    val context = LocalContext.current
    var holder by remember { mutableStateOf<AndroidContactSync?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        holder?.onPermission(r.values.all { it })
    }
    val sync = remember(context) {
        AndroidContactSync(
            context,
            askPermission = { permission.launch(arrayOf(Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS)) },
        ).also { holder = it }
    }
    LaunchedEffect(sync) { sync.begin() }
    return sync
}
