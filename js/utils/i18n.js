// =====================================================================
// i18n — FUNDAÇÃO (FR / PT), lógica pura, sem React e sem DOM
// =====================================================================
// O app fala francês para quem opera (a escola é francesa) e português no
// código e em parte das telas administrativas. Hoje isso vive misturado em
// literais espalhados por 40 arquivos.
//
// ⚠️ ESTE ARQUIVO É SÓ A FUNDAÇÃO. Uma única tela — o login — está
// migrada, como prova de que a peça funciona ponta a ponta. As outras
// continuam com os literais de sempre e NÃO devem ser migradas sem
// decisão: migrar tela por tela é trabalho de revisão de texto com quem
// usa o sistema, não de busca-e-substitui.
//
// Escolhas que valem explicação:
//
//  • CHAVE AUSENTE DEVOLVE A CHAVE, nunca string vazia. Um rótulo vazio
//    numa tela de operação é pior que um rótulo feio: o botão continua
//    lá, sem dizer o que faz. "login.entrar" na tela é feio e é ÓBVIO —
//    alguém reporta no mesmo dia.
//
//  • O idioma é PREFERÊNCIA DA MÁQUINA, não da pessoa. Os postos são
//    fixos (portaria, cantina, CDI) e quem senta neles muda; o que não
//    muda é a língua de quem trabalha naquele posto. Por isso
//    localStorage, e não o perfil do usuário no banco.
//
//  • Sem detecção automática pelo navegador. O Electron roda em Windows
//    em português no PC do Sam e a escola opera em francês: adivinhar
//    acertaria justamente ao contrário.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboI18n, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /** Idioma de trabalho da escola. */
    const PADRAO = 'fr';

    /** Chave no localStorage — prefixo `magbo.` como o resto das preferências. */
    const CHAVE_STORAGE = 'magbo.lang';

    const IDIOMAS = [
        { code: 'fr', label: 'Français' },
        { code: 'pt', label: 'Português' }
    ];

    /**
     * Dicionários.
     *
     * Chaves em `tela.elemento`, ordenadas por tela. `fr` é a referência: uma
     * chave que exista em `pt` e não em `fr` é erro de digitação, e o teste
     * cobra isso.
     */
    const DICIONARIOS = {
        fr: {
            'idioma.rotulo': 'Langue',

            'login.tag': "CONTRÔLE D'ACCÈS",
            'login.marca.subtitulo': 'Système institutionnel de contrôle',
            'login.marca.subtitulo2': "d'accès multi-secteurs",
            'login.identificacao': 'Identification',
            'login.titulo': 'Bienvenue',
            'login.subtitulo': 'Veuillez vous identifier pour accéder',
            'login.usuario': 'IDENTIFIANT',
            'login.senha': 'MOT DE PASSE',
            'login.entrar': 'ACCÉDER',
            'login.entrando': 'CONNEXION...',
            'login.erro.campos': 'Veuillez remplir tous les champs.',
            'login.erro.conexao': 'Erreur de connexion.',
            'login.rodape.seguranca': 'SYSTÈME SÉCURISÉ · CONNEXION CHIFFRÉE'
        },
        pt: {
            'idioma.rotulo': 'Idioma',

            'login.tag': 'CONTROLE DE ACESSO',
            'login.marca.subtitulo': 'Sistema institucional de controle',
            'login.marca.subtitulo2': 'de acesso multissetorial',
            'login.identificacao': 'Identificação',
            'login.titulo': 'Bem-vindo',
            'login.subtitulo': 'Identifique-se para acessar',
            'login.usuario': 'USUÁRIO',
            'login.senha': 'SENHA',
            'login.entrar': 'ENTRAR',
            'login.entrando': 'CONECTANDO...',
            'login.erro.campos': 'Preencha todos os campos.',
            'login.erro.conexao': 'Erro de conexão.',
            'login.rodape.seguranca': 'SISTEMA SEGURO · CONEXÃO CIFRADA'
        }
    };

    let idiomaAtual = PADRAO;

    /** Aceita só o que existe; qualquer outra coisa vira o padrão. */
    function normalizar(code) {
        const c = String(code == null ? '' : code).trim().toLowerCase().slice(0, 2);
        return DICIONARIOS[c] ? c : PADRAO;
    }

    /**
     * Lê a preferência da máquina. Chamado uma vez na carga do app.
     * localStorage indisponível (modo restrito) não pode derrubar nada.
     */
    function init(storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        try {
            idiomaAtual = normalizar(store && store.getItem(CHAVE_STORAGE));
        } catch (e) {
            idiomaAtual = PADRAO;
        }
        return idiomaAtual;
    }

    /** Troca e PERSISTE. Devolve o idioma que ficou valendo. */
    function setLang(code, storage) {
        idiomaAtual = normalizar(code);
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        try {
            if (store) store.setItem(CHAVE_STORAGE, idiomaAtual);
        } catch (e) {
            // Preferência não persistiu; a sessão atual continua no idioma novo.
        }
        return idiomaAtual;
    }

    function getLang() {
        return idiomaAtual;
    }

    function languages() {
        return IDIOMAS.map(function (l) { return { code: l.code, label: l.label }; });
    }

    /**
     * Traduz.
     *
     * Ordem: idioma atual → idioma padrão → a própria chave. A chave na tela
     * é deliberada: ela denuncia o buraco em vez de escondê-lo.
     *
     * `params` faz substituição simples de `{nome}` — o suficiente para
     * "Bonjour {nome}" sem arrastar uma biblioteca de plural e gênero para
     * dentro de um app que hoje tem duas telas de texto variável.
     */
    function t(chave, params) {
        const k = String(chave == null ? '' : chave);
        const atual = DICIONARIOS[idiomaAtual] || {};
        const padrao = DICIONARIOS[PADRAO] || {};
        let texto = atual[k];
        if (texto == null) texto = padrao[k];
        if (texto == null) return k;
        return interpolar(texto, params);
    }

    function interpolar(texto, params) {
        if (!params) return texto;
        return texto.replace(/\{(\w+)\}/g, function (todo, nome) {
            return Object.prototype.hasOwnProperty.call(params, nome)
                ? String(params[nome])
                : todo;   // parâmetro que ninguém passou fica visível, não some
        });
    }

    return {
        PADRAO: PADRAO,
        CHAVE_STORAGE: CHAVE_STORAGE,
        DICIONARIOS: DICIONARIOS,
        normalizar: normalizar,
        init: init,
        setLang: setLang,
        getLang: getLang,
        languages: languages,
        t: t
    };
});
