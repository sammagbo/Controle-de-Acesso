package com.magbo.access.services;

import com.magbo.access.dto.hikvision.CameraAlarmDto;
import com.magbo.access.models.DenialReason;
import com.magbo.access.models.User;
import com.magbo.access.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Descobre DE QUEM e o rosto que a camera da portaria reconheceu.
 *
 * A camera nao sabe quem e ninguem para o MAGBO: ela compara o rosto com a
 * propria biblioteca facial e devolve um nome e um numero de documento
 * digitados a mao por outra equipe. Ligar isso ao cadastro e o trabalho desta
 * classe, e a regra e conservadora por construcao — numa portaria, atribuir a
 * passagem a pessoa errada e liberar a saida de uma crianca no nome de outra.
 *
 * ORDEM, e ela importa:
 *   1. NUMERO DO DOCUMENTO ja guardado (camera_person_id). Deterministico:
 *      um numero, uma pessoa. Nao ha ambiguidade possivel e nao se olha o nome.
 *   2. NOME normalizado, e SO se casar com EXATAMENTE UM cadastro ativo. No
 *      casamento unico o numero e GRAVADO naquela pessoa, e a partir da
 *      proxima passagem cai-se no caso 1 — o casamento por nome acontece uma
 *      vez na vida de cada pessoa.
 *   3. Zero casamentos ou mais de um: NAO CHUTA. Devolve o motivo e o nome
 *      lido, para virar tentativa negada e uma linha de INFO com nome,
 *      biblioteca e similaridade — que e o que permite a alguem ligar as duas
 *      pontas na mao.
 *
 * NUNCA CRIA PESSOA. Aluno vem do Pronote, servidor vem das telas de servidor.
 * Um evento de camera que criasse cadastro produziria uma pessoa sem turma,
 * sem responsavel e sem vinculo — exatamente o registro duplicado que a
 * importacao do HikCentral tambem se recusa a criar.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CameraIdentityService {

    private final UserRepository userRepository;

    /**
     * Limiar usado quando a camera NAO informa o dela (FDLibThreshold).
     *
     * 0.70 e o valor configurado nas cameras da escola. Property para poder ser
     * apertado sem recompilar se a portaria comecar a ver falso-positivo.
     */
    @Value("${magbo.camera.similarity-threshold:0.70}")
    private double limiarPadrao;

    /** O que se conseguiu (ou nao) concluir sobre o rosto. */
    public enum Resultado {
        /** Uma pessoa, sem duvida. */
        IDENTIFICADO,
        /** Rosto sem dono: sem candidato, abaixo do limiar, ou nome fora do cadastro. */
        DESCONHECIDO,
        /** O nome casa com mais de um cadastro ativo. */
        AMBIGUO
    }

    /**
     * @param user        preenchido apenas em IDENTIFICADO
     * @param nome        nome lido da camera (pode existir mesmo sem casamento)
     * @param biblioteca  FDLibName — entra no log para dizer de qual lista veio
     * @param similaridade normalizada para 0..1
     */
    public record Identidade(
            Resultado resultado,
            User user,
            String nome,
            String biblioteca,
            Double similaridade,
            String certificateNumber) {

        public DenialReason motivoDeNegacao() {
            return resultado == Resultado.AMBIGUO ? DenialReason.AMBIGUOUS_NAME : DenialReason.UNKNOWN_FACE;
        }
    }

    /**
     * Resolve a identidade do primeiro rosto do evento.
     *
     * @Transactional porque o casamento por nome GRAVA o numero do documento na
     * pessoa — a identificacao e uma escrita, na primeira vez.
     */
    @Transactional
    public Identidade resolver(CameraAlarmDto dto) {
        if (dto == null) {
            return new Identidade(Resultado.DESCONHECIDO, null, null, null, null, null);
        }

        CameraAlarmDto.Candidate candidato = dto.melhorCandidato();

        // ── Comparacao falhou: nao ha candidato nenhum ──
        // errorMsg "contrastFailed" e identify[].maxsimilarity de 0.13-0.21.
        // Nao ha nome a guardar alem do que o payload nao deu.
        if (candidato == null) {
            Double maior = maxSimilaridade(dto);
            log.info("Camera: rosto sem casamento (motivo={}, maxSimilaridade={})",
                    dto.errorMsg(), maior);
            return new Identidade(Resultado.DESCONHECIDO, null, null, null, maior, null);
        }

        String nome = candidato.nome();
        String biblioteca = candidato.getFdLibName();
        Double similaridade = normalizarSimilaridade(candidato.getSimilarity());
        double limiar = limiarEfetivo(candidato);
        String documento = candidato.certificateNumber();

        // ── Porta de similaridade ──
        // Abaixo do limiar da biblioteca a camera "achou parecido", nao "achou".
        // Tratar como falha e o unico caminho seguro: um casamento de 40% numa
        // portaria e um convite a liberar a pessoa errada.
        if (similaridade == null || similaridade < limiar) {
            log.info("Camera: similaridade abaixo do limiar, tratado como nao reconhecido "
                            + "(nome={}, biblioteca={}, similaridade={}, limiar={})",
                    nome, biblioteca, similaridade, limiar);
            return new Identidade(Resultado.DESCONHECIDO, null, nome, biblioteca, similaridade, documento);
        }

        // ── 1. Numero do documento ja conhecido ──
        if (documento != null) {
            var porDocumento = userRepository.findByCameraPersonId(documento);
            if (porDocumento.isPresent()) {
                return new Identidade(Resultado.IDENTIFICADO, porDocumento.get(),
                        nome, biblioteca, similaridade, documento);
            }
        }

        // ── 2. Nome, e so se for unico ──
        String alvo = PersonNameMatcher.normalize(nome);
        if (alvo == null) {
            log.info("Camera: candidato sem nome utilizavel (biblioteca={}, similaridade={})",
                    biblioteca, similaridade);
            return new Identidade(Resultado.DESCONHECIDO, null, nome, biblioteca, similaridade, documento);
        }

        List<User> casamentos = new ArrayList<>();
        for (User u : userRepository.findByAtivoTrue()) {
            if (alvo.equals(PersonNameMatcher.normalize(u.getNome()))) {
                casamentos.add(u);
            }
        }

        if (casamentos.isEmpty()) {
            log.info("Camera: nome nao encontrado no cadastro (nome='{}', biblioteca={}, similaridade={})",
                    nome, biblioteca, similaridade);
            return new Identidade(Resultado.DESCONHECIDO, null, nome, biblioteca, similaridade, documento);
        }

        if (casamentos.size() > 1) {
            log.info("Camera: nome ambiguo, {} cadastros ativos (nome='{}', biblioteca={}, similaridade={}, ids={})",
                    casamentos.size(), nome, biblioteca, similaridade,
                    casamentos.stream().map(User::getId).toList());
            return new Identidade(Resultado.AMBIGUO, null, nome, biblioteca, similaridade, documento);
        }

        User unico = casamentos.get(0);
        guardarDocumento(unico, documento, nome, biblioteca);
        return new Identidade(Resultado.IDENTIFICADO, unico, nome, biblioteca, similaridade, documento);
    }

    /**
     * Grava o numero do documento na pessoa — para que a proxima passagem seja
     * deterministica e nao dependa mais de como o nome foi digitado.
     *
     * SO quando a coluna esta vazia. Se a pessoa ja tem OUTRO numero, o nome
     * casou com alguem que a camera ja conhece por outro documento: pode ser
     * dois cadastros na biblioteca facial para a mesma pessoa, ou um homonimo
     * que escapou. Sobrescrever repontaria a identificacao em silencio, entao
     * fica o que estava e sai um WARN — este e caso para olho humano, nao para
     * o sistema resolver sozinho.
     */
    private void guardarDocumento(User user, String documento, String nome, String biblioteca) {
        if (documento == null) {
            log.info("Camera: '{}' casou com {} pelo nome, mas o payload nao trouxe "
                            + "certificateNumber — a proxima passagem casara por nome de novo",
                    nome, user.getId());
            return;
        }
        String atual = user.getCameraPersonId();
        if (atual != null && !atual.equals(documento)) {
            log.warn("Camera: {} ja tem camera_person_id={} e o evento trouxe {} — NAO sobrescrito "
                            + "(nome='{}', biblioteca={}). Conferir duplicata na biblioteca facial.",
                    user.getId(), atual, documento, nome, biblioteca);
            return;
        }
        if (atual == null) {
            user.setCameraPersonId(documento);
            userRepository.save(user);
            log.info("Camera: {} ligado ao documento {} pelo nome '{}' (biblioteca={}) — "
                            + "as proximas passagens serao identificadas por ele",
                    user.getId(), documento, nome, biblioteca);
        }
    }

    /**
     * Limiar em vigor para este candidato, normalizado para 0..1.
     *
     * O da camera tem precedencia sobre o da property: quem configurou a
     * biblioteca decidiu qual rigor aquela lista exige, e o MAGBO nao tem
     * informacao melhor. A property so cobre o payload que nao informa.
     */
    private double limiarEfetivo(CameraAlarmDto.Candidate candidato) {
        Double doPayload = normalizarSimilaridade(candidato.getFdLibThreshold());
        return doPayload != null ? doPayload : limiarPadrao;
    }

    /**
     * Traz similaridade e limiar para a MESMA escala (0..1).
     *
     * ⚠️ O payload mistura as duas: maxsimilarity aparece como 0.13-0.21
     * (fracao) e FDLibThreshold como 70 (percentual). Comparar os dois crus
     * daria "0.87 < 70" e reprovaria todo reconhecimento bom — silenciosamente,
     * porque o resultado seria "ninguem foi reconhecido hoje", que parece
     * problema de camera. Valor acima de 1 e lido como percentual.
     */
    static Double normalizarSimilaridade(Double valor) {
        if (valor == null) return null;
        if (valor.isNaN() || valor.isInfinite()) return null;
        if (valor < 0) return null;
        return valor > 1.0 ? valor / 100.0 : valor;
    }

    /** maxsimilarity da comparacao que falhou — so para a linha de log. */
    private Double maxSimilaridade(CameraAlarmDto dto) {
        CameraAlarmDto.Identify id = dto.primeiraIdentificacao();
        return id == null ? null : normalizarSimilaridade(id.getMaxsimilarity());
    }
}
