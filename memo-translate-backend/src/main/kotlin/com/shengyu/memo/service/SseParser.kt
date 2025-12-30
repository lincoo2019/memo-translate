package com.shengyu.memo.service

import org.slf4j.LoggerFactory

object SseParser {
    private val logger = LoggerFactory.getLogger(SseParser::class.java)
    private val CONTENT_REGEX = "\"content\"\\s*:\\s*\"(.*?)(?<!\\\\)\"".toRegex()

    /**
     * Parse raw SSE data line and extract the content delta
     */
    fun parseDelta(line: String): String? {
        val data = line.removePrefix("data:").trim()
        if (data == "[DONE]" || data.isEmpty()) return null
        
        return try {
            CONTENT_REGEX.find(data)?.groupValues?.get(1)
                ?.replace("\\n", "\n")
                ?.replace("\\\"", "\"")
                ?.replace("\\\\", "\\")
        } catch (e: Exception) {
            logger.error("Failed to parse SSE line: $line", e)
            null
        }
    }
}
