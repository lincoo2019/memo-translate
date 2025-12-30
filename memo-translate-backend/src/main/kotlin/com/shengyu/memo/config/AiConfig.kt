package com.shengyu.memo.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.bind.ConstructorBinding

@ConfigurationProperties(prefix = "spring.ai.openai")
data class OpenAiProperties(
    val apiKey: String,
    val baseUrl: String = "https://api.openai.com",
    val chat: ChatProperties = ChatProperties()
)

data class ChatProperties(
    val options: ChatOptions = ChatOptions()
)

data class ChatOptions(
    val model: String = "gpt-3.5-turbo",
    val temperature: Double = 0.7
)
