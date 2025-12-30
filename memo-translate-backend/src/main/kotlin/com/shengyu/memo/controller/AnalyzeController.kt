package com.shengyu.memo.controller

import com.shengyu.memo.dto.AnalyzeRequest
import com.shengyu.memo.dto.ChatRequest
import com.shengyu.memo.service.OpenAiService
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.*
import reactor.core.publisher.Flux

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = ["*"]) // TODO: Restrict to extension origin in production
class AnalyzeController(
    private val openAiService: OpenAiService
) {

    @PostMapping("/analyze", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun analyze(@RequestBody request: AnalyzeRequest): Flux<String> {
        return openAiService.analyzeSentenceStream(request.text)
    }

    @PostMapping("/chat", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun chat(@RequestBody request: ChatRequest): Flux<String> {
        return openAiService.chatStream(request.context, request.message)
    }
}
