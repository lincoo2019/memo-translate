package com.shengyu.memo.controller

import com.shengyu.memo.dto.AnalyzeRequest
import com.shengyu.memo.dto.AnalyzeResponse
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = ["*"])
class AnalyzeController(
    private val openAiService: com.shengyu.memo.service.OpenAiService
) {

    @PostMapping("/analyze", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun analyze(@RequestBody request: AnalyzeRequest): reactor.core.publisher.Flux<String> {
        return openAiService.analyzeSentenceStream(request.text)
    }
}
