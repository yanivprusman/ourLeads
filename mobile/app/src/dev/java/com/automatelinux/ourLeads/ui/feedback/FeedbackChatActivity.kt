package com.automatelinux.ourLeads.ui.feedback

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.hilt.navigation.compose.hiltViewModel
import com.automatelinux.ourLeads.ui.theme.AppTheme
import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.ui.chat.FeedbackChatScreen
import com.automatelinux.feedbacklib.ui.chat.FeedbackChatViewModel
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class FeedbackChatActivity : ComponentActivity() {
    @Inject lateinit var feedbackConfig: FeedbackConfig

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                val viewModel: FeedbackChatViewModel = hiltViewModel()
                LaunchedEffect(Unit) { viewModel.setServerFound(true) }
                FeedbackChatScreen(
                    viewModel = viewModel,
                    config = feedbackConfig,
                    onNavigateBack = { finish() },
                    onNavigateToIssues = { startActivity(Intent(this@FeedbackChatActivity, FeedbackIssuesActivity::class.java)) },
                )
            }
        }
    }
}
