package com.shengyu.memo.service

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Flux

@Service
class OpenAiService(
    @Value("\${spring.ai.openai.api-key}") private val apiKey: String,
    @Value("\${spring.ai.openai.base-url}") private val baseUrl: String,
    @Value("\${spring.ai.openai.chat.options.model}") private val model: String
) {
    private val logger = LoggerFactory.getLogger(OpenAiService::class.java)
    
    private val webClient = WebClient.builder()
        .baseUrl(baseUrl)
        .defaultHeader("Authorization", "Bearer $apiKey")
        .build()

    fun analyzeSentenceStream(text: String): Flux<String> {
        logger.info("Streaming analysis for: ${text.take(50)}...")
        
        val systemPrompt = """
            You are an expert English tutor. Analyze the sentence.
            Structure your response EXACTLY like this (use these markers):
            [grammar]分析句子的语法结构、时态等。
            [phrases]列出关键短语，逗号隔开。
            [tip]给出一个有趣的记忆点。
            
            Analyze: "$text"
        """.trimIndent()

        val requestBody = mapOf(
            "model" to model,
            "messages" to listOf(
                mapOf("role" to "user", "content" to systemPrompt)
            ),
            "stream" to true,
            "temperature" to 0.7
        )

        return webClient.post()
            .uri("/chat/completions")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(requestBody)
            .retrieve()
            .bodyToFlux(String::class.java)
            .handle<String> { line, sink ->
                val data = if (line.startsWith("data:")) {
                    line.substring(5).trim()
                } else {
                    line.trim()
                }

                if (data == "[DONE]" || data.isEmpty()) return@handle
                
                try {
                    val regex = "\"content\"\\s*:\\s*\"(.*?)(?<!\\\\)\"".toRegex()
                    val match = regex.find(data)
                    val content = match?.groupValues?.get(1)
                    
                    if (content != null) {
                        val decoded = content.replace("\\n", "\n")
                               .replace("\\\"", "\"")
                               .replace("\\\\", "\\")
                        sink.next(decoded)
                    }
                } catch (e: Exception) {
                    logger.error("Error parsing stream line: $line", e)
                }
            }
            .doOnNext { logger.info("Extracted content: $it") }
    }
}
