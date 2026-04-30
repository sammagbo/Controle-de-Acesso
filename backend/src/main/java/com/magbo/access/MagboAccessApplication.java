package com.magbo.access;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MagboAccessApplication {

    public static void main(String[] args) {
        SpringApplication.run(MagboAccessApplication.class, args);
    }
}
