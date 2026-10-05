package com.automatelinux.ourLeads.ui.feedback

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.automatelinux.feedbacklib.ui.FeedbackOverlay

/** Dev flavor: the floating feedback bubble over the whole app. */
@Composable
fun FeedbackHost(content: @Composable () -> Unit) {
    FeedbackOverlay(modifier = Modifier.fillMaxSize(), showFab = true) { content() }
}
