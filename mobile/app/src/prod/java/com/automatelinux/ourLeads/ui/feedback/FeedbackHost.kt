package com.automatelinux.ourLeads.ui.feedback

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Prod flavor: no feedback widget. */
@Composable
fun FeedbackHost(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) { content() }
}
