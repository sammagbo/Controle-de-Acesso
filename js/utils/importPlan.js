// =====================================================================
// ESTADOS DA ABA HIKCENTRAL — lógica pura, sem React e sem DOM
// =====================================================================
// A aba HikCentral é a tela mais perigosa do sistema: ela transfere FACES
// entre pessoas. Um painel que mostre o botão de confirmar na hora errada,
// ou que esconda a lista de conferência manual, produz uma face no dono
// errado — e ninguém descobre até o aluno ser negado no terminal.
//
// Toda a decisão de "o que aparece e o que está habilitado" mora aqui,
// fora do componente, porque componente neste projeto não é testável: não
// há bundler, as telas só existem dentro do Electron.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboImportPlan, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboImportPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /** As cinco ações que o backend devolve por linha da planilha. */
    const ACOES = ['CRIAR', 'ATUALIZAR', 'PULAR', 'CONFLITO', 'REVISAO_MANUAL'];

    /** Ações que o operador precisa VER numa lista, não só contar. */
    const ACOES_PROBLEMA = ['CONFLITO', 'PULAR'];

    /**
     * Estado do painel de importação a partir do plano devolvido pelo backend.
     *
     * Três estados possíveis, e a diferença entre eles é o que o operador pode
     * fazer:
     *   'sem-arquivo' → ainda não leu planilha nenhuma;
     *   'simulado'    → leu e conferiu, NADA foi gravado, dá para confirmar;
     *   'aplicado'    → já gravou; confirmar de novo seria gravar duas vezes.
     *
     * @param plano resposta de previewHikCentralImport / applyHikCentralImport
     */
    function planState(plano) {
        if (!plano) {
            return {
                estado: 'sem-arquivo',
                titulo: null,
                totais: {},
                total: 0,
                revisao: [],
                problemas: [],
                podeConfirmar: false,
                rotuloConfirmar: null,
                precisaConferencia: false
            };
        }

        const totais = plano.totais || {};
        const aplicado = plano.aplicado === true;
        const revisao = Array.isArray(plano.revisaoManual) ? plano.revisaoManual : [];
        const linhas = Array.isArray(plano.linhas) ? plano.linhas : [];
        const problemas = linhas.filter(function (l) {
            return l && ACOES_PROBLEMA.indexOf(l.acao) !== -1;
        });

        return {
            estado: aplicado ? 'aplicado' : 'simulado',
            // O título é a promessa que a tela faz ao operador. Enquanto a
            // simulação não for aplicada ele PRECISA ler "nada foi gravado".
            titulo: aplicado ? 'Resultado da importação' : 'Simulação — nada foi gravado ainda',
            totais: totais,
            total: numero(totais.TOTAL),
            revisao: revisao,
            problemas: problemas,
            // Confirmar só existe entre simular e aplicar.
            podeConfirmar: !aplicado,
            rotuloConfirmar: aplicado ? null
                : 'CONFIRMAR — ' + numero(totais.CRIAR) + ' criar, ' + numero(totais.ATUALIZAR) + ' atualizar',
            precisaConferencia: revisao.length > 0
        };
    }

    function numero(v) {
        return (typeof v === 'number' && isFinite(v)) ? v : 0;
    }

    /**
     * Painel "é na verdade um aluno" / "conferir" — o mesmo formato nos dois.
     *
     * A pergunta que ele responde é sempre a mesma: uma face vai trocar de
     * dono; o operador já tem tudo o que precisa para decidir?
     *
     * Etapas:
     *   'busca-curta'  → menos de 2 caracteres, não vale procurar;
     *   'encontrados'  → há candidatos, escolher um;
     *   'ausente'      → procurou e não achou: o aluno não está no MAGBO;
     *   'escolhido'    → um aluno selecionado, prévia carregando ou pronta.
     *
     * @param s { query, resultados, escolhido, previa, substituir, salvando, erro }
     */
    function reclassState(s) {
        const estado = s || {};
        const query = String(estado.query == null ? '' : estado.query).trim();
        const resultados = Array.isArray(estado.resultados) ? estado.resultados : [];
        const escolhido = estado.escolhido || null;
        const previa = estado.previa || null;
        const salvando = estado.salvando === true;
        const substituir = estado.substituir === true;

        // Substituição CONSCIENTE: o aluno já tem outra face ligada, e
        // confirmar sem marcar a caixa apagaria o reconhecimento antigo sem
        // que ninguém tivesse dito que aceitava isso.
        const exigeSubstituicao = !!(previa && previa.substituiIdentificadorDoAluno);

        let etapa;
        if (escolhido) etapa = 'escolhido';
        else if (query.length < 2) etapa = 'busca-curta';
        else if (resultados.length > 0) etapa = 'encontrados';
        else etapa = 'ausente';

        return {
            etapa: etapa,
            mostrarLista: etapa === 'encontrados',
            // A mensagem "não está no MAGBO" só depois de procurar de verdade.
            mostrarAusente: etapa === 'ausente',
            mostrarPrevia: !!previa,
            mostrarErro: !!estado.erro,
            exigeSubstituicao: exigeSubstituicao,
            // Botão só com aluno escolhido E prévia na tela: confirmar sem ver
            // os dois lados é assinar em branco.
            mostrarBotoes: !!escolhido,
            podeConfirmar: !!escolhido
                && !salvando
                && !!previa
                && (!exigeSubstituicao || substituir),
            rotuloConfirmar: salvando ? 'GRAVANDO...' : 'CONFIRMAR — é um aluno'
        };
    }

    return {
        ACOES: ACOES,
        ACOES_PROBLEMA: ACOES_PROBLEMA,
        planState: planState,
        reclassState: reclassState
    };
});
