package com.automatelinux.outLeads

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.automatelinux.outLeads.ui.theme.AppTheme

// Shared entry composable — rendered by MainActivity on Android and (on a Mac)
// by ComposeUIViewController on iOS. Put your real UI in commonMain.
@Composable
fun App() {
    AppTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("OutLeads", style = MaterialTheme.typography.headlineMedium)
            }
        }
    }
}
