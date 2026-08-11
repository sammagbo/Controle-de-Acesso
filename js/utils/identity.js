// =====================================================================
// COMO UMA PESSOA APARECE NA TELA — lógica pura, sem React e sem DOM
// =====================================================================
// Uma regra só, para todas as telas: quem lê precisa saber QUEM passou.
// Um identificador cru (0003535, FUNC-004, CAM:SEM-IDENTIDADE) não diz isso
// para ninguém — nem para quem trabalha no sistema todo dia.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboIdentity, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Textos por idioma. Não passam pelo i18n porque este módulo é chamado de
     * telas em português (cantina, portaria) e em francês (Rapport, Journal) na
     * mesma sessão — o idioma aqui é o da TELA, não o da máquina.
     */
    const TEXTOS = {
        pt: {
            semIdentidade: 'Pessoa não reconhecida',
            naoCadastrado: 'Não cadastrado',
            nomeIndisponivel: 'Nome indisponível'
        },
        fr: {
            semIdentidade: 'Personne non reconnue',
            naoCadastrado: 'Non enregistré',
            nomeIndisponivel: 'Nom indisponible'
        }
    };

    /**
     * ⚠️ PREFIXO DAS CHAVES SINTÉTICAS DA CÂMERA — nunca são matrícula.
     *
     * Quando a câmera da portaria não resolve identidade, o backend precisa de
     * ALGUMA chave para agrupar a tentativa e usa `CAM:HID:<human_id>` ou a
     * constante `CAM:SEM-IDENTIDADE`. São chaves internas de deduplicação: não
     * apontam para pessoa nenhuma, não existem em app_users e não significam
     * nada para quem está na portaria. Mostrá-las no lugar de um nome é o pior
     * caso desta tela — parece informação e não é.
     */
    const PREFIXO_CAMERA = 'CAM:';

    function textos(lang) {
        return TEXTOS[lang] || TEXTOS.pt;
    }

    function limpo(v) {
        const s = v == null ? '' : String(v).trim();
        return s === '' ? null : s;
    }

    /** É uma chave sintética da câmera, e não uma matrícula? */
    function ehChaveDeCamera(valor) {
        const s = limpo(valor);
        return s != null && s.indexOf(PREFIXO_CAMERA) === 0;
    }

    /**
     * A matrícula que dá para mostrar como informação secundária, ou null.
     *
     * Chave de câmera vira null: ela não é identificador de pessoa, e exibi-la
     * como "matrícula" ensinaria o operador a procurar um cadastro que não
     * existe.
     */
    function matriculaLegivel(valor) {
        const s = limpo(valor);
        if (s == null || ehChaveDeCamera(s)) return null;
        return s;
    }

    /**
     * O nome recebido serve como NOME, ou é identificador disfarçado?
     *
     * O `nome` que vem numa tentativa é o `nome_snapshot` — o texto que a
     * câmera leu na biblioteca facial. Normalmente é um nome de gente, mas nada
     * garante: já chegou vazio, e um dia pode chegar igual ao próprio número.
     * Aceitar isso sem olhar reintroduziria o defeito por outra porta.
     */
    function ehNomeUtilizavel(nome, employeeNoRaw) {
        const s = limpo(nome);
        if (s == null) return false;
        if (ehChaveDeCamera(s)) return false;
        if (limpo(employeeNoRaw) != null && s === limpo(employeeNoRaw)) return false;
        // Só dígitos, ou o padrão FUNC-###: é matrícula escrita no campo errado.
        if (/^\d+$/.test(s)) return false;
        if (/^(FUNC|PROF)-\d+$/i.test(s)) return false;
        return true;
    }

    /**
     * Como esta pessoa deve aparecer.
     *
     * PURO DE PROPÓSITO: quem procura no cache é o componente, que já o tem em
     * mãos; assim esta regra dá para testar sem DOM e sem window.
     *
     * @param dados {{ pessoa, userId, employeeNoRaw, nome }}
     *        pessoa        — o cadastro já resolvido (window.userCache.byId), ou null
     *        userId        — matrícula ligada ao evento, quando houver
     *        employeeNoRaw — o que o aparelho mandou (pode ser chave de câmera)
     *        nome          — nome_snapshot: o que a câmera LEU, quando houver
     * @param opcoes {{ lang: 'pt'|'fr' }}
     * @returns {{ nome, matricula, estado, reconhecido, etiqueta }}
     *
     * `nome` NUNCA volta como código: quando não há identidade, volta a frase
     * ("Pessoa não reconhecida" / "Personne non reconnue"). `matricula` é
     * informação SECUNDÁRIA e pode ser null; a tela nunca deve mostrá-la
     * sozinha.
     */
    function resolver(dados, opcoes) {
        const d = dados || {};
        const t = textos((opcoes || {}).lang);
        const pessoa = d.pessoa || null;
        const matricula = matriculaLegivel(d.userId) || matriculaLegivel(d.employeeNoRaw);

        // 1. Cadastro resolvido: o caso normal.
        const doCadastro = pessoa ? limpo(pessoa.nome) : null;
        if (doCadastro != null) {
            return {
                nome: doCadastro,
                matricula: matricula || matriculaLegivel(pessoa.id),
                estado: 'CADASTRADO',
                reconhecido: true,
                etiqueta: null
            };
        }

        // 2. A câmera leu um nome que não casou com nenhum cadastro. O nome é
        //    a melhor informação existente — e a etiqueta diz que ele não veio
        //    do cadastro, para ninguém confundir com pessoa registrada.
        if (ehNomeUtilizavel(d.nome, d.employeeNoRaw)) {
            return {
                nome: limpo(d.nome),
                matricula: matricula,
                estado: 'LIDO_NAO_CADASTRADO',
                reconhecido: false,
                etiqueta: t.naoCadastrado
            };
        }

        // 3. Há matrícula, mas o nome não está à mão (o cache ainda não chegou,
        //    ou a pessoa saiu do cadastro). Palavra primeiro, número como
        //    apoio — nunca o número sozinho.
        if (matricula != null) {
            return {
                nome: t.nomeIndisponivel,
                matricula: matricula,
                estado: 'NOME_INDISPONIVEL',
                reconhecido: false,
                etiqueta: null
            };
        }

        // 4. Nenhuma identidade: rosto que a câmera não reconheceu
        //    (contrastFailed). Dito em palavras, como se diria em voz alta.
        return {
            nome: t.semIdentidade,
            matricula: null,
            estado: 'SEM_IDENTIDADE',
            reconhecido: false,
            etiqueta: null
        };
    }

    /** Uma linha só: "Nome (0003535)" — para CSV e títulos de acessibilidade. */
    function emUmaLinha(dados, opcoes) {
        const r = resolver(dados, opcoes);
        return r.matricula ? r.nome + ' (' + r.matricula + ')' : r.nome;
    }

    return {
        TEXTOS: TEXTOS,
        PREFIXO_CAMERA: PREFIXO_CAMERA,
        ehChaveDeCamera: ehChaveDeCamera,
        matriculaLegivel: matriculaLegivel,
        ehNomeUtilizavel: ehNomeUtilizavel,
        resolver: resolver,
        emUmaLinha: emUmaLinha
    };
});
