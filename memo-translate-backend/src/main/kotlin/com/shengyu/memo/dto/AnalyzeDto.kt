package com.shengyu.memo.dto

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonPropertyDescription

data class AnalyzeRequest(
    val text: String
)

data class ChatRequest(
    val context: String,
    val message: String
)

data class AnalyzeResponse(
    @JsonProperty("grammar")
    @JsonPropertyDescription("Detailed grammar analysis in Chinese")
    val grammar: String,
    
    @JsonProperty("phrases")
    @JsonPropertyDescription("List of key phrases from the sentence")
    val phrases: List<String>,
    
    @JsonProperty("memoryTip")
    @JsonPropertyDescription("A creative mnemonic tip in Chinese")
    val memoryTip: String
)

