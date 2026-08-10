package com.magbo.access.controllers;

import com.magbo.access.models.UserPhoto;
import com.magbo.access.repositories.UserPhotoRepository;
import com.magbo.access.services.PhotoZipReader;
import com.magbo.access.services.UserPhotoService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Fotos de identificacao: leitura de uma, e a importacao em lote.
 *
 * ⚠️ ESTAS SAO FOTOS DE MENORES. As regras nao sao recomendacoes:
 *
 * 1. NAO HA URL PUBLICA. A leitura exige autenticacao — e por isso que a tela
 *    busca a imagem por fetch com o cabecalho Authorization e monta um
 *    objectURL, em vez de um <img src> direto (o navegador nao manda cabecalho
 *    em <img>). Um endpoint aberto "so para o kiosk" seria um catalogo de
 *    rostos de criancas a um GET de distancia.
 * 2. NAO HA EXPORTACAO. Nao existe endpoint que devolva o conjunto, ZIP de
 *    saida ou listagem com imagem embutida. Sai uma foto por requisicao.
 * 3. NENHUM BYTE VAI PARA LOG. As linhas de log deste arquivo trazem matricula,
 *    nome de arquivo e contagem — nunca conteudo, nem "os primeiros bytes".
 * 4. NADA AQUI TOCA NAS IMAGENS DA CAMERA. faceImage / backgroundImage /
 *    faceLibImage continuam descartadas no webhook, como sempre foram. So entra
 *    aqui arquivo que um operador escolheu e enviou.
 * 5. A EXCLUSAO E DEFINITIVA. DELETE de verdade, sem soft delete.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class UserPhotoController {

    private final UserPhotoService photoService;
    private final UserPhotoRepository photoRepository;
    private final PhotoZipReader zipReader;

    /**
     * Quanto o kiosk pode reutilizar a imagem sem perguntar de novo.
     *
     * private, nunca public: "public" autorizaria um proxy da rede da escola a
     * guardar retratos de alunos e a servi-los a quem pedir. A revalidacao por
     * ETag cobre a troca de foto — o rosto muda pouco, mas quando muda a tela
     * nao pode ficar meia hora mostrando o antigo.
     */
    private static final Duration CACHE = Duration.ofMinutes(30);

    // ───────────────── Leitura ─────────────────

    /**
     * A foto de uma pessoa. 404 quando nao ha — e a tela cai no avatar de
     * iniciais, que e o comportamento de hoje.
     *
     * isAuthenticated() e nao uma area especifica: quem opera qualquer setor ja
     * ve o nome e a turma da pessoa na tela: o retrato nao acrescenta acesso a
     * ninguem que ja nao estivesse olhando aquela pessoa passar.
     */
    @GetMapping("/api/users/{userId}/photo")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> photo(@PathVariable String userId,
                                        @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        Optional<UserPhoto> encontrada = photoRepository.findById(userId);
        if (encontrada.isEmpty()) return ResponseEntity.notFound().build();

        UserPhoto foto = encontrada.get();
        String etag = "\"" + foto.getSha256() + "\"";

        // 304 antes de montar o corpo: numa tela de 50 linhas com polling de
        // 3s, devolver 20KB por foto por ciclo e o que transforma um kiosk numa
        // maquina de download.
        if (ifNoneMatch != null && ifNoneMatch.contains(foto.getSha256())) {
            return ResponseEntity.status(304)
                    .eTag(etag)
                    .cacheControl(CacheControl.maxAge(CACHE).cachePrivate())
                    .build();
        }

        return ResponseEntity.ok()
                .eTag(etag)
                .cacheControl(CacheControl.maxAge(CACHE).cachePrivate())
                .contentType(MediaType.parseMediaType(foto.getContentType()))
                .contentLength(foto.getByteSize())
                .body(foto.getBytes());
    }

    // ───────────────── Importacao ─────────────────

    /** Resumo para a tela abrir sabendo quantas fotos ja existem. */
    @GetMapping("/api/admin/photos/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> summary() {
        return ResponseEntity.ok(Map.of("comFoto", photoService.quantidade()));
    }

    /**
     * SIMULACAO da importacao de arquivos soltos (a pasta escolhida na tela).
     * Nao grava nada.
     */
    @PostMapping("/api/admin/photos/import/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> previewArquivos(@RequestParam("files") List<MultipartFile> files) {
        return executar(deMultipart(files), null);
    }

    /** Aplica. O plano e REFEITO aqui contra o estado atual do banco. */
    @PostMapping("/api/admin/photos/import")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> aplicarArquivos(@RequestParam("files") List<MultipartFile> files) {
        return executar(deMultipart(files), operador());
    }

    /**
     * SIMULACAO a partir de um ZIP, enviado como CORPO CRU.
     *
     * consumes = application/zip e nao multipart: ver o javadoc do
     * PhotoZipReader. Em resumo, os limites de multipart do projeto existem
     * para proteger o webhook das cameras, e um ZIP de 1200 fotos passa deles —
     * afrouxa-los por causa desta tela seria mexer no numero errado.
     */
    @PostMapping(value = "/api/admin/photos/import/preview/zip", consumes = "application/zip")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> previewZip(HttpServletRequest request) {
        return executarZip(request, null);
    }

    @PostMapping(value = "/api/admin/photos/import/zip", consumes = "application/zip")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> aplicarZip(HttpServletRequest request) {
        return executarZip(request, operador());
    }

    /**
     * Apaga a foto de uma pessoa — DELETE de verdade.
     *
     * Nao e "arquivar" nem "inativar": e o pedido de quem nao quer mais a
     * imagem do filho no sistema, e a unica resposta honesta e a linha deixar
     * de existir. Fica de fora, de proposito, qualquer exclusao em massa: uma
     * foto por vez, com quem pediu identificado no log de acesso.
     */
    @DeleteMapping("/api/admin/photos/{userId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> apagar(@PathVariable String userId) {
        boolean apagada = photoService.delete(userId);
        if (!apagada) {
            return ResponseEntity.status(404).body(Map.of(
                    "status", "error", "message", "Esta pessoa nao tem foto cadastrada."));
        }
        log.info("Foto apagada por {}: user={}", operador(), userId);
        return ResponseEntity.ok(Map.of(
                "status", "success", "message", "Foto removida definitivamente."));
    }

    // ───────────────── Auxiliares ─────────────────

    private ResponseEntity<?> executarZip(HttpServletRequest request, String operador) {
        try {
            return executar(zipReader.ler(request.getInputStream()), operador);
        } catch (PhotoZipReader.ZipInvalidoException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        } catch (IOException e) {
            log.warn("Falha lendo o corpo do ZIP de fotos: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error", "message", "Nao foi possivel ler o arquivo enviado."));
        }
    }

    private ResponseEntity<?> executar(List<UserPhotoService.ArquivoDeFoto> arquivos, String operador) {
        try {
            return ResponseEntity.ok(operador == null
                    ? photoService.plan(arquivos)
                    : photoService.apply(arquivos, operador));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", e.getMessage()));
        }
    }

    /**
     * Converte as parts em arquivos em memoria.
     *
     * getOriginalFilename() do navegador vem com o caminho relativo quando a
     * escolha foi uma PASTA ("turma3B/0004048.jpg"); o nomeSimples do servico
     * corta isso — a matricula esta no nome, nunca na pasta.
     */
    private List<UserPhotoService.ArquivoDeFoto> deMultipart(List<MultipartFile> files) {
        List<UserPhotoService.ArquivoDeFoto> saida = new ArrayList<>();
        if (files == null) return saida;
        for (MultipartFile f : files) {
            try {
                saida.add(new UserPhotoService.ArquivoDeFoto(
                        UserPhotoService.nomeSimples(f.getOriginalFilename()),
                        f.getContentType(),
                        f.getBytes()));
            } catch (IOException e) {
                // Nome do arquivo, nunca conteudo. Uma part ilegivel vira um
                // arquivo vazio, que o servico ja reporta como RECUSADO na
                // linha certa — melhor que derrubar o lote inteiro.
                log.warn("Part de foto ilegivel, tratada como vazia: {}", f.getOriginalFilename());
                saida.add(new UserPhotoService.ArquivoDeFoto(
                        UserPhotoService.nomeSimples(f.getOriginalFilename()), null, new byte[0]));
            }
        }
        return saida;
    }

    private String operador() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? "system" : auth.getName();
    }
}
