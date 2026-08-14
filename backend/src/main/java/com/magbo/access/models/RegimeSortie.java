package com.magbo.access.models;

/**
 * REGIME DE SORTIE — o direito ANUAL de sair, fixado pelos responsaveis por
 * escrito no inicio do ano letivo.
 *
 * Referencia: circulaire n. 96-248 du 25 octobre 1996. Nao e uma invencao
 * deste sistema nem uma preferencia da escola: e a categoria com que a Vie
 * Scolaire francesa organiza a saida dos alunos, e o carnet de correspondance
 * de cada aluno traz a sua.
 *
 * ⚠️ NAO CONFUNDIR COM {@link StudentExitPermission}. Sao coisas de naturezas
 * diferentes e as duas precisam existir:
 *
 *   • O REGIME e a regra PERMANENTE do ano — "esta crianca pode, em geral,
 *     sair sozinha?". Vem da familia, por escrito, uma vez por ano.
 *   • A PERMISSAO e a excecao PONTUAL — "hoje, as 14h, esta crianca sai para
 *     ir ao dentista". Vem da familia ou da Vie Scolaire, para um caso.
 *
 * Uma permissao pontual VENCE o regime (e para isso que ela existe). Um regime
 * nunca vence uma permissao.
 *
 * ⚠️ O QUE ESTE ENUM NAO DIZ: se ESTE momento e um momento permitido. Isso
 * depende da GRADE HORARIA — de haver ou nao aula agora, de o professor ter
 * faltado —, e a grade vive no Pronote, nao aqui. O
 * {@link com.magbo.access.services.RegimeSortieService} e explicito sobre a
 * fronteira: onde falta a grade, ele responde A_VERIFIER e devolve a decisao a
 * quem esta no portao. Um sistema que fingisse saber liberaria uma crianca de
 * regime 2 no meio da manha.
 */
public enum RegimeSortie {

    /**
     * REGIME 1 — SURVEILLE. O aluno permanece no estabelecimento durante toda
     * a meia-jornada; so sai no fim dela (externo) ou no fim do dia
     * (demi-pensionnaire), ou com autorizacao pontual.
     *
     * E o regime mais restritivo e o padrao de fato no collège.
     */
    REGIME_1,

    /**
     * REGIME 2 — SEMI-LIBRE. O aluno pode sair quando ha ausencia de professor,
     * conforme o reglement interieur: fim da meia-jornada se externo, fim do
     * dia se demi-pensionnaire.
     *
     * ⚠️ Depende de saber que o professor faltou — informacao que o MAGBO nao
     * tem e provavelmente nunca tera em tempo real. Por isso, dentro da
     * jornada, este regime produz A_VERIFIER e nao um veredicto.
     */
    REGIME_2,

    /**
     * REGIME 3 — LIBRE. O aluno pode sair durante os intervalos livres da sua
     * grade.
     *
     * ⚠️ "Livre" nao e "irrestrito": no collège, nenhum aluno sai durante uma
     * hora de permanencia, e a circulaire e clara nisso. Este regime e, na
     * pratica, do lycée. A distincao collège/lycée nao esta modelada no MAGBO
     * (a turma e uma String livre), entao o servico nao a adivinha — ver
     * RegimeSortieService.
     */
    REGIME_3
}
