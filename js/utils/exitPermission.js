// =====================================================================
// AUTORIZAÇÃO DE SAÍDA — montagem e validação do formulário, lógica pura
// =====================================================================
// O formulário começava com um campo de MATRÍCULA em branco. A Vie Scolaire
// conhece os alunos pelo nome, e um dígito trocado criava em silêncio uma
// autorização para a criança errada — ou para ninguém, que só se descobre
// quando o aluno é barrado no portão.
//
// Agora a matrícula sai de uma ESCOLHA, não de digitação. Este módulo é o
// que garante que ela chegue ao payload e que não dê para salvar sem ter
// escolhido — as duas coisas que a tela não tem como provar sozinha (não há
// bundler; as telas só existem dentro do Electron).
//
// ⚠️ O CONTRATO DA API NÃO MUDOU: o corpo continua sendo o mesmo
// ExitPermissionRequest de sempre, com `userId` = matrícula. Isto é mudança
// de INTERFACE, não de API.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboExitPermission, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboExitPermission = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /** Mínimo para buscar. 1 letra casaria com meia escola. */
    const MINIMO_BUSCA = 2;

    /** Espelha DAY_NUM do backend: daysOfWeek é CSV de ISO 1-7 (provado por curl 17/07). */
    const DIA_ISO = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5 };

    /** Vale a pena ir ao servidor? */
    function buscaValida(termo) {
        return String(termo == null ? '' : termo).trim().length >= MINIMO_BUSCA;
    }

    /**
     * Só ALUNO é selecionável.
     *
     * O servidor já filtra (StudentSearchService), e isto é a segunda tranca:
     * se um dia a tela passar a usar outra fonte de busca, a lista continua
     * não oferecendo um funcionário para "autorizar a saída".
     */
    function apenasAlunos(resultados) {
        return (Array.isArray(resultados) ? resultados : [])
            .filter(function (u) { return u && u.tipo === 'ALUNO'; });
    }

    /** Como o aluno escolhido aparece na tela: nome, turma e matrícula. */
    function descreverAluno(aluno) {
        if (!aluno) return null;
        return {
            id: aluno.id || '',
            nome: aluno.nome || '',
            turma: aluno.turma || '—',
            // Uma linha só, para o cabeçalho da seleção e para os testes.
            resumo: [aluno.nome, aluno.turma || '—', aluno.id].filter(Boolean).join(' · ')
        };
    }

    /**
     * O formulário pode ser salvo?
     *
     * Devolve o MOTIVO, não só um booleano: um botão que não faz nada e não
     * diz por quê é o que faz o operador clicar cinco vezes e concluir que o
     * sistema travou.
     *
     * @param f { aluno, autorizadoPor, tipo, validFrom, validUntil, startTime, endTime, dias }
     */
    function validar(f) {
        const form = f || {};
        if (!form.aluno || !form.aluno.id) {
            return { ok: false, motivo: 'Selecione o aluno pelo nome antes de salvar.' };
        }
        if (!String(form.autorizadoPor || '').trim()) {
            return { ok: false, motivo: 'Informe quem autorizou a saída.' };
        }
        if (form.tipo === 'SINGLE') {
            if (!form.validFrom || !form.validUntil) {
                return { ok: false, motivo: 'Informe a saída e o retorno máximo.' };
            }
        } else {
            const marcados = Object.keys(form.dias || {}).filter(function (d) { return form.dias[d]; });
            if (marcados.length === 0) {
                return { ok: false, motivo: 'Marque ao menos um dia da semana.' };
            }
        }
        return { ok: true, motivo: null };
    }

    /**
     * Corpo do POST /api/admin/exit-permissions.
     *
     * Espelha o ExitPermissionRequest do backend EXATAMENTE — o mesmo que a
     * tela já montava. A ÚNICA diferença é a origem do `userId`: vem do aluno
     * escolhido, não do que alguém digitou.
     *
     * @returns o corpo, ou null se o formulário não puder ser salvo (o
     *          chamador já checou com validar(); o null é a segunda tranca)
     */
    function montarPayload(f, hoje) {
        const form = f || {};
        if (!form.aluno || !form.aluno.id) return null;

        const payload = {
            userId: form.aluno.id,
            permissionType: form.tipo,
            reason: form.autorizadoPor,
            note: form.observacoes || null
        };

        if (form.tipo === 'SINGLE') {
            // datetime-local -> LocalDate (YYYY-MM-DD) + LocalTime (HH:mm)
            payload.validFrom = String(form.validFrom || '').slice(0, 10);
            payload.validUntil = String(form.validUntil || '').slice(0, 10);
            payload.startTime = String(form.validFrom || '').slice(11, 16) || null;
            payload.endTime = String(form.validUntil || '').slice(11, 16) || null;
        } else {
            payload.startTime = form.startTime;
            payload.endTime = form.endTime;
            payload.daysOfWeek = Object.keys(form.dias || {})
                .filter(function (d) { return form.dias[d]; })
                .map(function (d) { return DIA_ISO[d]; })
                .filter(function (n) { return n != null; })
                .join(',');
            // Recorrente vale do dia atual até o fim do ano letivo civil.
            const ref = hoje instanceof Date ? hoje : new Date();
            payload.validFrom = dataIso(ref);
            payload.validUntil = ref.getFullYear() + '-12-31';
        }
        return payload;
    }

    /** YYYY-MM-DD em hora LOCAL — toISOString() daria o dia anterior à noite no BRT. */
    function dataIso(d) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;
    }

    return {
        MINIMO_BUSCA: MINIMO_BUSCA,
        DIA_ISO: DIA_ISO,
        buscaValida: buscaValida,
        apenasAlunos: apenasAlunos,
        descreverAluno: descreverAluno,
        validar: validar,
        montarPayload: montarPayload
    };
});
