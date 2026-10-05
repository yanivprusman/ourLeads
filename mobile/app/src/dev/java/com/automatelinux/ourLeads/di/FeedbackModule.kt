package com.automatelinux.ourLeads.di

import com.automatelinux.ourLeads.BuildConfig
import com.automatelinux.ourLeads.util.ScreenTracker
import com.automatelinux.feedbacklib.FeedbackConfig
import com.automatelinux.feedbacklib.data.api.FeedbackApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

// Dev flavor only: the feedback widget talks to the app's own Next.js backend.
@Module
@InstallIn(SingletonComponent::class)
object FeedbackModule {
    @Provides @Singleton
    fun provideFeedbackApi(): FeedbackApi {
        val client = OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.MINUTES)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(FeedbackApi::class.java)
    }

    @Provides @Singleton
    fun provideFeedbackConfig(): FeedbackConfig =
        FeedbackConfig(appName = "ourLeads", currentScreenProvider = { ScreenTracker.currentScreen })
}
