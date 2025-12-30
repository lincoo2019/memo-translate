package com.shengyu.memo.service

import com.shengyu.memo.config.OpenAiProperties
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Flux

@Service
class OpenAiService(
    private val properties: OpenAiProperties
) {
    private val logger = LoggerFactory.getLogger(OpenAiService::class.java)
    
    private val webClient = WebClient.builder()
        .baseUrl(properties.baseUrl)
        .defaultHeader("Authorization", "Bearer ${properties.apiKey}")
        .build()

    fun analyzeSentenceStream(text: String): Flux<String> {
        return webClient.post()
            .uri("/chat/completions")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(buildRequestBody(text))
            .retrieve()
            .bodyToFlux(String::class.java)
            .handle { line, sink ->
                SseParser.parseDelta(line)?.let { sink.next(it) }
            }
            .doOnSubscribe { logger.info("AI Analysis Started: ${text.take(30)}...") }
    }

    private fun buildRequestBody(text: String): Map<String, Any> {
        val systemPrompt = """
            You are an expert English tutor. Analyze the sentence structure and vocabulary.
            Structure your response using these exact markers:
            [grammar] - Grammar analysis in Chinese
            [phrases] - Key phrases, comma separated
            [tip] - Mnemonic tip in Chinese
            
            Analyze: "$text"
        """.trimIndent()

        return mapOf(
            "model" to properties.chat.options.model,
            "messages" to listOf(mapOf("role" to "user", "content" to systemPrompt)),
            "stream" to true,
            "temperature" to properties.chat.options.temperature
        )
    }
}
