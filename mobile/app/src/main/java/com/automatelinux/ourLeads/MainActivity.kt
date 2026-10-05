package com.automatelinux.ourLeads

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.draw.scale
import com.automatelinux.ourLeads.ui.feedback.FeedbackHost
import dagger.hilt.android.AndroidEntryPoint

// Thin Android launcher — all UI lives in the shared commonMain App() composable.
// @AndroidEntryPoint: feedback-lib's overlay (dev flavor) resolves Hilt view models here.
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The top of every screen is the dark brand band, so the status bar icons are
        // always light — not guessed from the phone's day/night setting.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        setContent {
            FeedbackHost {
                App(
                    baseUrl = BuildConfig.API_BASE_URL,
                    token = BuildConfig.API_TOKEN,
                    fontFamily = Heebo,
                    dockBottom = if (BuildConfig.FLAVOR == "dev") 58.dp else 12.dp,
                    mark = { modifier ->
                        // The launcher icon itself: same two layers, cropped like a launcher does.
                        Box(modifier.clip(RoundedCornerShape(24))) {
                            Image(painterResource(R.drawable.ic_launcher_background), null, Modifier.fillMaxSize().scale(1.5f), contentScale = ContentScale.Crop)
                            Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.fillMaxSize().scale(1.5f), contentScale = ContentScale.Crop)
                        }
                    },
                )
            }
        }
    }
}

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun heebo(weight: Int) = Font(
    R.font.heebo,
    FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** Heebo, bundled: the same Hebrew face as the web board, at every weight the UI uses. */
private val Heebo = FontFamily(heebo(400), heebo(500), heebo(600), heebo(700), heebo(800))
