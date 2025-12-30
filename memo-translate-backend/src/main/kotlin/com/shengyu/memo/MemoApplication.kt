package com.shengyu.memo

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
@org.springframework.boot.context.properties.ConfigurationPropertiesScan
class MemoApplication

fun main(args: Array<String>) {
    runApplication<MemoApplication>(*args)
}
