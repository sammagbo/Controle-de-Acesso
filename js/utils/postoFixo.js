// =====================================================================
// POSTO FIXO — lógica pura de quem TRABALHA no ponto
// =====================================================================
// Vive fora dos componentes pelo mesmo motivo do reportFilters: é regra, não
// tela, e é a única forma de testá-la sem abrir o Electron.
//
// O problema, medido em produção em 10/08/2026: quem fica de pé no portão — o
// porteiro, e também a Vie Scolaire de plantão — é reconhecido pela câmera
// dezenas de vezes por dia. Passagens legítimas, separadas por minutos: a regra
// de mesma passagem (30 s, para leitura repetida) não as alcança e nem deveria.
//
// O que o backend faz: grava TODAS, marca da segunda do dia em diante com
// flag='POSTO_FIXO' e as tira das telas padrão e dos contadores. Nada é
// apagado, e o Journal continua listando cada uma.
//
// O que este módulo faz: nomeia a flag para o front, sugere um ponto a partir
// do departamento (SUGERE — quem decide é o operador) e lista os pontos onde
// faz sentido alguém ficar postado.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboPostoFixo, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboPostoFixo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /** Espelho de PostoFixoService.FLAG_POSTO_FIXO — mudar os DOIS juntos. */
    const FLAG_POSTO_FIXO = 'POSTO_FIXO';

    /**
     * Pontos onde faz sentido alguém ficar postado.
     *
     * Espelho consciente de AreaMapping.pointToArea() no backend, que é quem
     * VALIDA — a lista aqui só monta o menu. Mesma convenção do ACCESS_POINTS
     * em js/data/constants.js: alterar os dois juntos.
     *
     * Ficam de fora as telas virtuais (CANTINA_MONITOR, GENERAL_REPORT...):
     * ninguém fica postado num relatório.
     */
    const PONTOS = [
        { id: 'PORT1', label: 'Portail Principal' },
        { id: 'PORT2', label: 'Portail Terrain' },
        { id: 'PORT3', label: 'Garage' },
        { id: 'BIBLIO', label: 'CDI - Biblioteca' },
        { id: 'ENFERM', label: 'Infirmerie' },
        { id: 'REFEI1', label: 'Cantine Principale' },
        { id: 'REFEI2', label: 'Cantine Secondaire' },
    ];

    /**
     * Departamentos que SUGEREM um posto, e o ponto sugerido.
     *
     * ⚠️ SUGESTÃO, nunca decisão — e a distinção é o coração do desenho. O dado
     * real de produção mostra gente da VIE SCOLAIRE de plantão no portão e
     * gente da PORTARIA que precisa de rastreio normal em qualquer outro ponto.
     * Se o departamento decidisse, os dois casos ficariam errados e ninguém
     * teria como corrigir um sem quebrar o outro.
     *
     * Por isso só PORTARIA sugere: é o único departamento em que o posto é a
     * definição do cargo. Vie Scolaire fica de fora de propósito — parte dela
     * está no portão, parte não, e uma sugestão errada num campo que se salva
     * com um clique é pior que sugestão nenhuma.
     */
    const SUGESTOES = { 'PORTARIA': 'PORT1' };

    /** true quando esta passagem é a repetição do dia de quem está de serviço. */
    function ehPostoFixo(log) {
        return !!log && log.flag === FLAG_POSTO_FIXO;
    }

    /** Quantas das passagens em tela são repetição de posto fixo. */
    function contarPostoFixo(logs) {
        return (Array.isArray(logs) ? logs : []).filter(ehPostoFixo).length;
    }

    /**
     * Acentos, caixa e espaços fora — o departamento é String livre digitada à
     * mão, e "Portaria", "PORTARIA " e "portaría" são a mesma coisa.
     */
    function normalizar(texto) {
        if (texto == null) return '';
        return String(texto)
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .trim().toUpperCase();
    }

    /**
     * Ponto SUGERIDO para um cadastro, ou '' quando não há sugestão.
     *
     * O valor já gravado sempre vence: uma vez que alguém decidiu, o
     * departamento não tem mais nada a dizer. Sem isso, abrir a edição de um
     * porteiro cujo posto é PORT2 mostraria PORT1 e um clique em Salvar
     * desfaria a decisão de outra pessoa.
     */
    function sugerir(servidor) {
        if (!servidor) return '';
        const atual = (servidor.postoFixoPointId || '').trim();
        if (atual) return atual.toUpperCase();
        return SUGESTOES[normalizar(servidor.departamento)] || '';
    }

    /** true quando o valor em tela veio da sugestão e não do cadastro. */
    function ehSugestao(servidor, valorEmTela) {
        if (!servidor || !valorEmTela) return false;
        if ((servidor.postoFixoPointId || '').trim()) return false;
        return sugerir(servidor) === valorEmTela;
    }

    /** Rótulo legível de um ponto; o próprio id quando desconhecido. */
    function rotuloDoPonto(pointId) {
        if (!pointId) return '';
        const achado = PONTOS.find(p => p.id === String(pointId).toUpperCase());
        return achado ? achado.label : String(pointId);
    }

    /** true se o ponto é um dos que o backend aceita (o backend revalida). */
    function pontoValido(pointId) {
        if (!pointId) return false;
        return PONTOS.some(p => p.id === String(pointId).trim().toUpperCase());
    }

    return {
        FLAG_POSTO_FIXO: FLAG_POSTO_FIXO,
        PONTOS: PONTOS,
        SUGESTOES: SUGESTOES,
        ehPostoFixo: ehPostoFixo,
        contarPostoFixo: contarPostoFixo,
        sugerir: sugerir,
        ehSugestao: ehSugestao,
        rotuloDoPonto: rotuloDoPonto,
        pontoValido: pontoValido
    };
});
