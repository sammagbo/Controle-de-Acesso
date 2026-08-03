package com.magbo.access.integration;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Captura os eventos de log de UMA classe durante um teste, sem forkar o
 * contexto Spring.
 *
 * Motivo de existir: application-test.properties fixa
 * logging.level.com.magbo.access=WARN, entao INFO/DEBUG do controller nem
 * chegam ao console — OutputCaptureExtension nao veria nada. Subir o nivel via
 * @TestPropertySource forkaria o contexto compartilhado dos ITs (aviso do
 * AbstractIT). Este helper mexe direto no logger Logback da classe alvo e
 * RESTAURA o nivel no close(), preservando o contexto unico.
 */
final class LogCaptor implements AutoCloseable {

    private final Logger logger;
    private final Level previousLevel;
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    LogCaptor(Class<?> target) {
        this.logger = (Logger) LoggerFactory.getLogger(target);
        this.previousLevel = logger.getLevel();
        logger.setLevel(Level.DEBUG);
        appender.start();
        logger.addAppender(appender);
    }

    List<ILoggingEvent> events() {
        return appender.list;
    }

    /** Quantos eventos do nivel dado contem o trecho na mensagem formatada. */
    long count(Level level, String contains) {
        return appender.list.stream()
                .filter(e -> e.getLevel() == level)
                .filter(e -> e.getFormattedMessage().contains(contains))
                .count();
    }

    /** Quantos eventos do nivel dado existem, de qualquer mensagem. */
    long count(Level level) {
        return appender.list.stream().filter(e -> e.getLevel() == level).count();
    }

    @Override
    public void close() {
        logger.detachAppender(appender);
        appender.stop();
        logger.setLevel(previousLevel);
    }
}
