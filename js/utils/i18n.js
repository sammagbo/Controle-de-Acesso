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

            'acao.cancelar': 'Annuler',
            'acao.ok': 'OK',
            'acao.fechar': 'Fermer',
            'acao.adicionar': 'Ajouter',
            'acao.entrada.emoji': '✅ Entrée',
            'acao.saida.emoji': '🔴 Sortie',

            'comum.sem.nome': 'Sans nom',
            'comum.turma': 'Classe',
            'comum.status': 'Statut',
            'comum.tipo': 'Type',
            'comum.parentesco': 'Lien de parenté',

            'setor.busca': 'Badge ou recherche par nom... (Entrée pour chercher)',
            'setor.buscando': 'Recherche dans la base...',
            'setor.sem.resultado': 'Aucun résultat pour',
            'setor.aguardando': 'En attente de lecture',
            'setor.aguardando.dica': "Scannez le badge ou saisissez le nom de la personne",
            'setor.ultimos': 'Derniers passages',
            'setor.repeticoes': 'Répétitions',
            'setor.repeticoes.ajuda': "Répétitions qui n'ouvrent pas de nouvelle visite : qui est posté à ce point (gardien, permanence) et qui entre en étant déjà à l'intérieur. Enregistrées, mais hors de cette liste et des compteurs.",
            'setor.repeticao.etiqueta': 'Répétition — enregistrée, hors des compteurs',
            'setor.acessos24h': 'passages (24 h)',
            'setor.sem.registro': 'Aucun enregistrement',
            'setor.sem.registro.dica': 'Les passages apparaîtront ici en temps réel',

            'modal.nome.aluno': "Nom de l'élève",
            'modal.liberado': 'Autorisé ✅',
            'modal.responsavel': 'Responsable de la sortie',
            'modal.sem.responsavel': 'Aucun responsable enregistré',
            'modal.confirmar.saida': 'CONFIRMER LA SORTIE',
            'modal.registrado': 'PASSAGE ENREGISTRÉ',

            'feed.titulo': 'Tentatives refusées',

            'cantina.titulo': 'Moniteur Cantine',
            'cantina.subtitulo': 'Surveillance en temps réel — actualisé toutes les 3 s',
            'cantina.limpar': "Vider l'écran",
            'cantina.limpar.ajuda': 'Masque les passages actuels, sans rien supprimer',
            'cantina.limpar.confirma': "Vider l'écran ? (les données restent enregistrées)",
            'cantina.busca': 'Rechercher une personne (nom, classe ou ID)...',
            'cantina.sem.pessoa': 'Aucune personne trouvée',
            'cantina.achado.em': 'Trouvé dans :',
            'cantina.col.dentro': 'Dans la cantine',
            'cantina.col.sairam': 'Sortis',
            'cantina.col.deve.sair': 'Doit sortir',
            'cantina.col.vazio': 'Personne',
            'cantina.fora.horario': 'hors horaire',
            'cantina.agora': "à l'instant",

            'cdi.base': 'Élèves',
            'cdi.aluno.nome': 'Nom Prénom',
            'cdi.aluno.id': 'ID (auto)',
            'cdi.aluno.id.existe': 'ID déjà existant',
            'cdi.aluno.adicionado': 'Élève ajouté',
            'cdi.aluno.erro.adicionar': "Erreur à l'ajout",
            'cdi.aluno.erro.editar': 'Erreur à la modification',
            'cdi.aluno.salvo': 'Modifications enregistrées',
            'cdi.aluno.sem.exclusao': "La base élèves vient du Pronote — la suppression se fait dans les Réglages de l'application principale.",
            'cdi.ajuda.aba.atalhos': 'Raccourcis',
            'cdi.ajuda.aba.problemas': 'Dépannage',
            'cdi.ajuda.aba.suporte': 'Support',
            'cdi.ajuda.atalhos.titulo': 'Raccourcis clavier',
            'cdi.ajuda.problemas.titulo': 'Dépannage rapide',
            'cdi.ajuda.suporte.titulo': 'Support technique',
            'cdi.ajuda.buscar': 'Rechercher',
            'cdi.ajuda.travar': 'Verrouiller',
            'cdi.ajuda.scanner': 'Scanner',
            'cdi.ajuda.autofoco': 'Auto-focus',
            'cdi.ajuda.tecla.esc': 'Echap',
            'cdi.ajuda.scanner.inativo': 'Scanner inactif ?',
            'cdi.ajuda.scanner.remedio': 'Activez VERR NUM et cliquez dans la barre de recherche.',
            'cdi.ajuda.tela.bug': "Bug d'affichage ?",
            'cdi.ajuda.tela.remedio': 'Touchez F5 pour actualiser. Données sécurisées.',
            'cdi.ajuda.si': 'Service informatique',
            'cdi.ajuda.ramal': 'Poste 404',
            'acao.exportar.csv': 'Exporter CSV',

            'comum.carregando': 'Chargement...',
            'comum.erro.carregar': 'Erreur de chargement',

            'senha.mostrar': 'Afficher le mot de passe',
            'senha.ocultar': 'Masquer le mot de passe',

            'lista.mais': 'Afficher plus',
            'lista.faltam': '(reste',

            'feed.som.ligado': 'Son activé (cliquez pour couper)',
            'feed.som.desligado': 'Son coupé (cliquez pour activer)',
            'feed.vazio': "Aucune tentative refusée aujourd'hui",

            'cdi.presentes': 'Élèves Présents',
            'cdi.pin': 'Code PIN',
            'cdi.destravar': 'Déverrouiller',
            'cdi.historico': 'Historique',
            'cdi.sem.movimento': 'Aucun mouvement',

            'status.online': 'Système opérationnel',
            'status.offline': 'Serveur hors ligne',

            'timers.titulo': 'Temps de présence',
            'toast.responsavel': 'Responsable lié',
            'toast.aluno': 'Élève :',

            'pin.titulo': 'Accès administratif',
            'pin.subtitulo': 'Saisissez le PIN pour entrer dans le panneau administratif.',
            'pin.rotulo': 'PIN administratif',
            'pin.validando': 'Validation...',
            'pin.entrar': 'Entrer',
            'pin.erro': 'PIN incorrect',

            'dashboard.movimentacoes': "Mouvements aujourd'hui",
            'dashboard.cadastrados': 'Personnes enregistrées',
            'dashboard.pontos': "Points d'accès",
            'dashboard.titulo': 'Choisissez le poste de travail',
            'dashboard.subtitulo': "Sélectionnez le secteur pour démarrer le contrôle d'accès",
            'dashboard.abrir': 'Ouvrir le secteur',
            'dashboard.pessoa': '{n} personne',
            'dashboard.pessoas': '{n} personnes',

            'header.dashboard': 'Tableau de bord',
            'header.painel': 'Panneau administratif',
            'header.admin': 'Administration',
            'header.admin.abrir': 'Panneau administratif (PIN)',
            'header.admin.fechar': 'Fermer le panneau administratif',
            'header.config': 'Réglages et enregistrements',
            'header.sair': 'Se déconnecter',
            'header.online': 'Système en ligne',
            'header.voltar': 'Retour',
            'header.voltar.para': 'Retour : {destino}',

            'login.tag': "CONTRÔLE D'ACCÈS",
            'login.marca.produto': 'Access Control',
            'login.rodape.escola': 'LYCÉE MOLIÈRE · RIO DE JANEIRO',
            'login.rodape.ano': 'Anno MMXXVI · v1.0',
            'login.rodape.autor': 'sammagbo.com',
            'login.usuario.exemplo': 'admin',
            'login.esqueci': 'Mot de passe oublié ?',
            'login.esqueci.explicacao': "Votre demande sera transmise à l'administrateur, qui réinitialisera votre mot de passe. Indiquez votre nom d'utilisateur :",
            'login.esqueci.enviar': 'Envoyer la demande',
            'login.esqueci.cancelar': 'Annuler',
            'login.esqueci.enviado': "Demande enregistrée. L'administrateur la verra à sa prochaine connexion — en cas d'urgence, contactez la Vie Scolaire directement.",
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

            'acao.cancelar': 'Cancelar',
            'acao.ok': 'OK',
            'acao.fechar': 'Fechar',
            'acao.adicionar': 'Adicionar',
            'acao.entrada.emoji': '✅ Entrada',
            'acao.saida.emoji': '🔴 Saída',

            'comum.sem.nome': 'Sem nome',
            'comum.turma': 'Turma',
            'comum.status': 'Status',
            'comum.tipo': 'Tipo',
            'comum.parentesco': 'Parentesco',

            'setor.busca': 'Ler cartão ou buscar nome... (Enter para buscar)',
            'setor.buscando': 'Buscando na base de dados...',
            'setor.sem.resultado': 'Nenhum resultado para',
            'setor.aguardando': 'Aguardando leitura',
            'setor.aguardando.dica': 'Escaneie o cartão ou digite o nome da pessoa',
            'setor.ultimos': 'Últimos acessos',
            'setor.repeticoes': 'Repetições',
            'setor.repeticoes.ajuda': 'Repetições que não abrem visita nova: quem fica postado neste ponto (porteiro, plantão) e quem entra estando já dentro. Ficam gravadas, mas fora desta lista e das contagens.',
            'setor.repeticao.etiqueta': 'Repetição — gravada, mas fora das contagens',
            'setor.acessos24h': 'acessos (24 h)',
            'setor.sem.registro': 'Nenhum registro',
            'setor.sem.registro.dica': 'Os acessos aparecerão aqui em tempo real',

            'modal.nome.aluno': 'Nome do aluno(a)',
            'modal.liberado': 'Liberado ✅',
            'modal.responsavel': 'Responsável pela retirada',
            'modal.sem.responsavel': 'Sem responsável cadastrado',
            'modal.confirmar.saida': 'CONFIRMAR SAÍDA',
            'modal.registrado': 'ACESSO REGISTRADO',

            'feed.titulo': 'Tentativas negadas',

            'cantina.titulo': 'Monitor da Cantina',
            'cantina.subtitulo': 'Acompanhamento em tempo real — atualizado a cada 3 s',
            'cantina.limpar': 'Limpar a tela',
            'cantina.limpar.ajuda': 'Esconde as passagens atuais, sem apagar nada',
            'cantina.limpar.confirma': 'Limpar a tela? (os dados continuam gravados)',
            'cantina.busca': 'Buscar uma pessoa (nome, turma ou ID)...',
            'cantina.sem.pessoa': 'Nenhuma pessoa encontrada',
            'cantina.achado.em': 'Encontrado em:',
            'cantina.col.dentro': 'Na cantina',
            'cantina.col.sairam': 'Saíram',
            'cantina.col.deve.sair': 'Deve sair',
            'cantina.col.vazio': 'Ninguém',
            'cantina.fora.horario': 'fora do horário',
            'cantina.agora': 'agora mesmo',

            'cdi.base': 'Alunos',
            'cdi.aluno.nome': 'Nome Sobrenome',
            'cdi.aluno.id': 'ID (automático)',
            'cdi.aluno.id.existe': 'ID já existente',
            'cdi.aluno.adicionado': 'Aluno adicionado',
            'cdi.aluno.erro.adicionar': 'Erro ao adicionar',
            'cdi.aluno.erro.editar': 'Erro ao alterar',
            'cdi.aluno.salvo': 'Alterações salvas',
            'cdi.aluno.sem.exclusao': 'A base de alunos vem do Pronote — a exclusão se faz nas Configurações do aplicativo principal.',
            'cdi.ajuda.aba.atalhos': 'Atalhos',
            'cdi.ajuda.aba.problemas': 'Problemas',
            'cdi.ajuda.aba.suporte': 'Suporte',
            'cdi.ajuda.atalhos.titulo': 'Atalhos de teclado',
            'cdi.ajuda.problemas.titulo': 'Solução rápida',
            'cdi.ajuda.suporte.titulo': 'Suporte técnico',
            'cdi.ajuda.buscar': 'Buscar',
            'cdi.ajuda.travar': 'Travar',
            'cdi.ajuda.scanner': 'Leitor',
            'cdi.ajuda.autofoco': 'Foco automático',
            'cdi.ajuda.tecla.esc': 'Esc',
            'cdi.ajuda.scanner.inativo': 'Leitor sem resposta?',
            'cdi.ajuda.scanner.remedio': 'Ligue o NUM LOCK e clique na barra de busca.',
            'cdi.ajuda.tela.bug': 'Problema de exibição?',
            'cdi.ajuda.tela.remedio': 'Aperte F5 para atualizar. Os dados estão seguros.',
            'cdi.ajuda.si': 'Serviço de Informática',
            'cdi.ajuda.ramal': 'Ramal 404',
            'acao.exportar.csv': 'Exportar CSV',

            'comum.carregando': 'Carregando...',
            'comum.erro.carregar': 'Erro ao carregar',

            'senha.mostrar': 'Mostrar a senha',
            'senha.ocultar': 'Ocultar a senha',

            'lista.mais': 'Mostrar mais',
            'lista.faltam': '(faltam',

            'feed.som.ligado': 'Som ligado (clique para desligar)',
            'feed.som.desligado': 'Som desligado (clique para ligar)',
            'feed.vazio': 'Nenhuma tentativa negada hoje',

            'cdi.presentes': 'Alunos presentes',
            'cdi.pin': 'Código PIN',
            'cdi.destravar': 'Destravar',
            'cdi.historico': 'Histórico',
            'cdi.sem.movimento': 'Nenhum movimento',

            'status.online': 'Sistema operacional',
            'status.offline': 'Servidor offline',

            'timers.titulo': 'Tempo de permanência',
            'toast.responsavel': 'Responsável vinculado',
            'toast.aluno': 'Aluno:',

            'pin.titulo': 'Acesso administrativo',
            'pin.subtitulo': 'Digite o PIN para entrar no Painel Administrativo.',
            'pin.rotulo': 'PIN administrativo',
            'pin.validando': 'Validando...',
            'pin.entrar': 'Entrar',
            'pin.erro': 'PIN incorreto',

            'dashboard.movimentacoes': 'Movimentações hoje',
            'dashboard.cadastrados': 'Cadastrados',
            'dashboard.pontos': 'Pontos de acesso',
            'dashboard.titulo': 'Selecione o ponto de trabalho',
            'dashboard.subtitulo': 'Escolha o setor para iniciar o controle de acesso',
            'dashboard.abrir': 'Abrir setor',
            'dashboard.pessoa': '{n} pessoa',
            'dashboard.pessoas': '{n} pessoas',

            'header.dashboard': 'Painel',
            'header.painel': 'Painel Administrativo',
            'header.admin': 'Administração',
            'header.admin.abrir': 'Painel Administrativo (PIN)',
            'header.admin.fechar': 'Fechar o Painel Administrativo',
            'header.config': 'Configurações e Cadastros',
            'header.sair': 'Sair',
            'header.online': 'Sistema online',
            'header.voltar': 'Voltar',
            'header.voltar.para': 'Voltar: {destino}',

            'login.tag': 'CONTROLE DE ACESSO',
            'login.marca.produto': 'Access Control',
            'login.rodape.escola': 'LYCÉE MOLIÈRE · RIO DE JANEIRO',
            'login.rodape.ano': 'Anno MMXXVI · v1.0',
            'login.rodape.autor': 'sammagbo.com',
            'login.usuario.exemplo': 'admin',
            'login.esqueci': 'Esqueci minha senha',
            'login.esqueci.explicacao': 'Seu pedido será enviado ao administrador, que redefinirá sua senha. Informe seu nome de usuário:',
            'login.esqueci.enviar': 'Enviar pedido',
            'login.esqueci.cancelar': 'Cancelar',
            'login.esqueci.enviado': 'Pedido registrado. O administrador o verá no próximo acesso — se for urgente, procure a Vie Scolaire diretamente.',
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
        // AVISA O APP INTEIRO. Sem isto, trocar o idioma no cabeçalho mudaria
        // só o componente que chamou setLang, e o resto da tela ficaria na
        // língua anterior — exatamente a mistura que esta migração existe para
        // acabar. Quem escuta é o hook useI18n (js/utils/i18nReact.js), e todo
        // componente migrado passa por ele.
        // O guarda de `window` mantém o módulo puro para o Vitest.
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('magbo-lang-changed', { detail: idiomaAtual }));
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
