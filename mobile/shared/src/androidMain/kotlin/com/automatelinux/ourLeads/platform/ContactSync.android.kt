package com.automatelinux.ourLeads.platform

import android.Manifest
import android.accounts.AccountManager
import android.app.Activity
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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
    private val chooseAccount: () -> Unit,
) : ContactSync {
    private val prefs = context.getSharedPreferences("ourleads_contacts", Context.MODE_PRIVATE)
    private val resolver: ContentResolver = context.contentResolver
    private val lock = Mutex()
    private var askedThisRun = false
    override var problem by mutableStateOf<String?>(null)

    private val permitted get() = listOf(Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS)
        .all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
    private val accountName get() = prefs.getString("account_name", null)
    private val accountType get() = prefs.getString("account_type", null)

    /** Startup: walk through whatever is missing, unless the user already said no. */
    fun begin() {
        if (prefs.getBoolean("declined", false)) { problem = OFF; return }
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
            accountName == null -> chooseAccount()
            else -> problem = null
        }
    }

    fun onPermission(granted: Boolean) {
        if (granted) next() else { prefs.edit().putBoolean("declined", true).apply(); problem = NO_PERMISSION }
    }

    fun onAccount(name: String?, type: String?) {
        if (name == null || type == null) { prefs.edit().putBoolean("declined", true).apply(); problem = OFF; return }
        prefs.edit().putString("account_name", name).putString("account_type", type).apply()
        problem = null
    }

    override suspend fun sync(leads: List<Lead>, sources: List<SourceDef>) {
        val name = accountName ?: return
        val type = accountType ?: return
        if (!permitted) { problem = NO_PERMISSION; return }
        lock.withLock {
            withContext(Dispatchers.IO) {
                try {
                    val group = groupId(name, type)
                    for (lead in leads) save(lead, sources, name, type, group)
                    problem = null
                } catch (e: Exception) {
                    problem = "שמירת אנשי קשר נכשלה: ${e.message ?: e.javaClass.simpleName}"
                }
            }
        }
    }

    private fun save(lead: Lead, sources: List<SourceDef>, account: String, type: String, group: Long) {
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
                .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, account)
                .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, type)
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
        resolver.applyBatch(ContactsContract.AUTHORITY, ops)
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

    /** The "ourLeads" label in the chosen account — Google syncs it, so the leads are one filter away. */
    private fun groupId(account: String, type: String): Long {
        resolver.query(
            ContactsContract.Groups.CONTENT_URI, arrayOf(ContactsContract.Groups._ID),
            "${ContactsContract.Groups.ACCOUNT_NAME}=? AND ${ContactsContract.Groups.ACCOUNT_TYPE}=? AND ${ContactsContract.Groups.TITLE}=? AND ${ContactsContract.Groups.DELETED}=0",
            arrayOf(account, type, GROUP), null,
        )?.use { if (it.moveToFirst()) return it.getLong(0) }
        val uri = resolver.insert(ContactsContract.Groups.CONTENT_URI, android.content.ContentValues().apply {
            put(ContactsContract.Groups.ACCOUNT_NAME, account)
            put(ContactsContract.Groups.ACCOUNT_TYPE, type)
            put(ContactsContract.Groups.TITLE, GROUP)
            put(ContactsContract.Groups.GROUP_VISIBLE, 1)
        }) ?: error("could not create the $GROUP label")
        return uri.lastPathSegment!!.toLong()
    }

    companion object {
        const val OFF = "לידים לא נשמרים באנשי הקשר · הקש להפעלה"
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
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val ok = r.resultCode == Activity.RESULT_OK
        holder?.onAccount(
            r.data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)?.takeIf { ok },
            r.data?.getStringExtra(AccountManager.KEY_ACCOUNT_TYPE)?.takeIf { ok },
        )
    }
    val sync = remember(context) {
        AndroidContactSync(
            context,
            askPermission = { permission.launch(arrayOf(Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS)) },
            chooseAccount = {
                picker.launch(
                    AccountManager.newChooseAccountIntent(
                        null, null, arrayOf("com.google"),
                        "לאיזה חשבון לשמור את אנשי הקשר של הלידים?", null, null, null,
                    ),
                )
            },
        ).also { holder = it }
    }
    LaunchedEffect(sync) { sync.begin() }
    return sync
}
