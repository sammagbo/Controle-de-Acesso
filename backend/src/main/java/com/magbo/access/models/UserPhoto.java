package com.magbo.access.models;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Foto de identificacao de UMA pessoa, guardada no proprio banco.
 *
 * ── Por que no banco, e nao em disco ────────────────────────────────
 * O container do backend (deploy/docker-compose.yml) monta UM volume:
 * ../backend/target em /app. Esse diretorio e a saida do Maven — `mvn clean`
 * o apaga e todo build o reescreve. Uma foto escrita ali nao sobrevive ao
 * proprio procedimento de deploy; escrita em qualquer outro caminho do
 * container, nao sobrevive a um recreate. Guardar em disco exigiria um volume
 * novo, que e mudanca de deploy e decisao do Sam.
 *
 * No Postgres elas entram de graca no backup que ja existe (pg_dump -F c do
 * magbodb, no procedimento das migrations e na skill de backup). ~1200 fotos de
 * ~20KB sao ~25MB — nada perto dos ~440 mil registros de access_logs.
 *
 * ── Por que TABELA PROPRIA, e nao uma coluna em app_users ───────────
 * userRepository.findAll() roda em caminho quente: listStaff, o filtro de tipo
 * do Journal e o GET /api/users que alimenta o userCache das telas. Uma coluna
 * bytea na entidade User arrastaria os ~25MB para a memoria em CADA uma dessas
 * chamadas. E @Basic(fetch=LAZY) num atributo basico NAO funciona sem
 * bytecode enhancement — pareceria resolvido nos testes e derreteria o kiosk.
 * Com tabela separada, nenhuma consulta existente muda de plano.
 *
 * ⚠️ SEM @Lob, de proposito. No Hibernate 6, `byte[]` puro vira VARBINARY
 * (= bytea no PostgreSQL); com @Lob viraria OID, um objeto grande fora da linha
 * que o pg_dump trata de outro jeito e que quebraria a simplicidade toda de
 * "esta no dump como qualquer coluna".
 *
 * ── Dados de MENORES ────────────────────────────────────────────────
 * Estas sao fotos de alunos, a maioria menor de idade. As regras estao no
 * UserPhotoService e no UserPhotoController; aqui vale registrar as duas que
 * dizem respeito ao armazenamento: nao ha nenhum campo que guarde biometria
 * (isto e um retrato, nao um template facial), e a exclusao e DEFINITIVA —
 * DELETE de verdade, sem soft delete, porque o direito de apagar a imagem de
 * uma crianca nao se atende escondendo a linha.
 */
@Entity
@Table(name = "user_photos")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class UserPhoto {

    /**
     * Matricula da pessoa (o mesmo id de app_users). PK e nao coluna gerada:
     * uma pessoa tem no maximo uma foto, e a chave natural torna impossivel
     * duas linhas para o mesmo aluno — que seria a origem silenciosa de "a
     * tela mostra a foto errada".
     */
    @Id
    @EqualsAndHashCode.Include
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(name = "content_type", nullable = false, length = 32)
    private String contentType;

    /** Os bytes da imagem. NUNCA vao para log, nem em tamanho, nem em resumo. */
    @Column(name = "bytes", nullable = false)
    private byte[] bytes;

    /** Tamanho em bytes — permite relatorio e conferencia sem ler a imagem. */
    @Column(name = "byte_size", nullable = false)
    private Integer byteSize;

    /**
     * SHA-256 do conteudo, em hexadecimal.
     *
     * Serve a duas coisas concretas: e o ETag do endpoint (o kiosk revalida com
     * If-None-Match e recebe 304 em vez de 20KB a cada render) e permite ao
     * import dizer "identica, nada a fazer" em vez de reescrever 1200 linhas
     * toda vez que alguem reimporta a mesma pasta.
     */
    @Column(name = "sha256", nullable = false, length = 64)
    private String sha256;

    /** Nome do arquivo de origem — a unica pista de onde a foto veio. */
    @Column(name = "original_filename", length = 255)
    private String originalFilename;

    /** Operador que importou. Foto de menor entra com autor, sempre. */
    @Column(name = "updated_by", nullable = false, length = 50)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
