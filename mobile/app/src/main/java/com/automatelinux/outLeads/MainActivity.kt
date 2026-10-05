package com.automatelinux.outLeads

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

// Thin Android launcher — all UI lives in the shared commonMain App() composable.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            App(baseUrl = BuildConfig.API_BASE_URL, token = BuildConfig.API_TOKEN)
        }
    }
}
