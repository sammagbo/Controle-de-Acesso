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
            'acao.editar': 'Modifier',
            'acao.desativar': 'Désactiver',
            'acao.salvar': 'Enregistrer',
            'acao.descartar': 'Abandonner',

            'comum.nome': 'Nom',
            'comum.id': 'ID',
            'comum.ativo': 'Actif',
            'comum.inativo': 'Inactif',
            'comum.sim': 'oui',
            'comum.nao': 'non',
            'comum.erro.salvar': "Erreur à l'enregistrement",
            'comum.salvando': 'Enregistrement...',

            'usuarios.titulo': 'Personnes enregistrées',
            'usuarios.subtitulo': 'Gérez les élèves, professeurs, agents et responsables',
            'usuarios.erro.carregar': 'Erreur au chargement des personnes',
            'usuarios.desativar.confirma': "Désactiver cette personne ? Elle ne pourra plus accéder aux secteurs.",
            'usuarios.desativado': 'Personne désactivée.',
            'usuarios.atualizado': 'Personne mise à jour.',
            'usuarios.mostrar.inativos': 'Afficher les inactifs',
            'usuarios.busca': 'Rechercher par nom ou ID...',
            'usuarios.carregando': 'Chargement des personnes...',
            'usuarios.vazio': 'Aucune personne trouvée.',
            'usuarios.editar.titulo': 'Modifier la personne',
            'usuarios.editar.subtitulo': 'Modification des données de',
            'usuarios.nome.completo': 'Nom complet',
            'usuarios.turma.se.aluno': 'Classe (si élève)',
            'usuarios.turma.exemplo': 'Ex : 1A, 2B...',
            'usuarios.telefone': 'Téléphone',
            'usuarios.parentesco.exemplo': 'Ex : père, mère...',

            'operadores.titulo': 'Opérateurs du système',
            'operadores.subtitulo': 'Gérez qui peut opérer chaque secteur',
            'operadores.novo': 'Nouvel opérateur',
            'operadores.editar': "Modifier l'opérateur",
            'operadores.novo.subtitulo': 'Renseignez les données du nouvel opérateur',
            'operadores.desativar.confirma': "Désactiver cet opérateur ?\n\nIl ne pourra plus se connecter, immédiatement. Rien n'est effacé : l'historique et les enregistrements faits par lui restent, et le compte peut être réactivé ensuite par le crayon de modification.",
            'operadores.senha.titulo': 'Demandes de réinitialisation de mot de passe ({n})',
            'operadores.senha.dica': "Réinitialisez le mot de passe de l'opérateur avec le crayon de la liste ci-dessous, puis marquez la demande comme traitée",
            'operadores.senha.tratado': 'Marquer traité',
            'operadores.senha.rodape': "Réinitialisez le mot de passe avec le crayon de l'opérateur dans la liste ci-dessous ; un nom absent de la liste est quelqu'un qui s'est trompé de nom de compte.",
            'operadores.carregando': 'Chargement des opérateurs...',
            'operadores.col.usuario': 'Identifiant',
            'operadores.col.role': 'Rôle',
            'operadores.col.setores': 'Secteurs',
            'operadores.col.ultimo.login': 'Dernière connexion',
            'operadores.campo.login': 'Identifiant (login)',
            'operadores.campo.login.exemplo': 'ex : biblio1',
            'operadores.campo.nome': 'Nom complet',
            'operadores.campo.setores': 'Secteurs autorisés',
            'operadores.setor.cantine': 'Cantine',
            'operadores.setor.infirmerie': 'Infirmerie',
            'operadores.setor.cdi': 'CDI',
            'operadores.setor.portail': 'Portail (entrées)',
            'operadores.setor.tudo': 'Tout (admin)',
            'operadores.senha': 'Mot de passe',
            'operadores.senha.nova': 'Nouveau mot de passe (facultatif)',
            'operadores.ativo': 'Opérateur actif',

            'saidas.titulo': 'Contrôle des sorties',
            'saidas.subtitulo': 'Gérez les autorisations de sortie des élèves.',
            'saidas.erro.carregar': 'Erreur au chargement des autorisations.',
            'saidas.revogar.confirma': "Révoquer cette autorisation de sortie ?\n\nL'élève sera bloqué à la sortie immédiatement. La révocation ne peut pas être annulée — pour autoriser à nouveau, créez une nouvelle autorisation. L'enregistrement révoqué reste dans l'historique, avec qui a révoqué et quand.",
            'saidas.revogar.motivo': 'Révoqué manuellement par la loge',
            'saidas.nova': 'Nouvelle autorisation',
            'saidas.ativas': 'Autorisations actives',
            'saidas.vazio': 'Aucune autorisation active pour le moment.',
            'saidas.col.aluno': 'Élève',
            'saidas.col.validade': 'Validité',
            'saidas.col.responsavel': 'Autorisé par / Note',
            'saidas.col.acoes': 'Actions',
            'saidas.de': 'Du :',
            'saidas.ate': 'Au :',
            'saidas.revogar': 'Révoquer',
            'saidas.feed.titulo': 'Tentatives refusées — Portail',
            'saidas.selecione.aluno': "Sélectionnez l'élève par son nom avant d'enregistrer.",
            'saidas.nova.titulo': 'Nouvelle autorisation de sortie',
            'saidas.trocar': 'Changer',
            'saidas.busca.aluno': 'Rechercher par nom (ou matricule)...',
            'saidas.busca.vazia': "Aucun élève à ce nom. Vérifiez l'orthographe — la recherche ignore accents et majuscules.",
            'saidas.busca.minimo': 'Saisissez au moins {n} lettres du nom.',
            'saidas.autoridades.titulo': 'Qui a autorisé',
            'saidas.autoridade.familia': 'Famille (responsable légal)',
            'saidas.autoridade.familia.exemplo': 'Père, mère ou tuteur',
            'saidas.autoridade.familia.curta': 'Famille',
            'saidas.autoridade.escola': 'École (Vie Scolaire)',
            'saidas.autoridade.escola.exemplo': 'Membre de la Vie Scolaire',
            'saidas.autoridade.escola.curta': 'École',
            'saidas.autoridades.regra.a': 'Renseignez',
            'saidas.autoridades.regra.b': 'au moins une',
            'saidas.autoridades.regra.c': "des deux. Les deux ensemble quand la famille a autorisé et que la Vie Scolaire a contresigné.",
            'saidas.tipo': "Type d'autorisation",
            'saidas.tipo.unica': 'Sortie unique (date/heure précise)',
            'saidas.tipo.recorrente': 'Récurrente (jours de la semaine)',
            'saidas.campo.saida': 'Sortie',
            'saidas.campo.retorno': 'Retour (max)',
            'saidas.campo.hora.inicio': 'Heure de début',
            'saidas.campo.hora.fim': 'Heure de fin',
            'saidas.campo.dias': 'Jours autorisés',
            'saidas.campo.obs': 'Observations (facultatif)',
            'saidas.salvar': "Enregistrer l'autorisation",

            'cantina.hist.titulo': "Historique d'accès cantine",
            'cantina.hist.erro': "Erreur de chargement de l'historique.",
            'cantina.hist.carregando': "Chargement de l'historique...",
            'cantina.hist.vazio': 'Aucun historique disponible',
            'cantina.hist.import': 'Import',
            'cantina.hist.manual': 'Manuel',
            'cantina.hist.validade': 'Validité',
            'cantina.hist.nota': 'Note',
            'cantina.hist.por': 'Par',
            'cantina.hist.sistema': 'Système',

            'cantina.gestao.titulo': 'Gestion Cantine',
            'cantina.gestao.subtitulo': 'Gérez les droits de repas des élèves.',
            'cantina.gestao.erro.carregar': 'Erreur lors du chargement des données.',
            'cantina.gestao.sem.permissao': "Vous n'avez pas l'autorisation de modifier ce droit.",
            'cantina.gestao.motivo.ui': 'Modifié via interface cantine',
            'cantina.gestao.xlsx.ausente': "La bibliothèque XLSX n'est pas chargée.",
            'cantina.gestao.importar': 'Importer la liste (XLSX)',
            'cantina.gestao.lendo': 'Lecture...',
            'cantina.gestao.import.titulo': 'Importer la liste des droits (.xlsx)',
            'cantina.gestao.import.nada': "Aucune ligne reconnue. Vérifiez que la feuille a les colonnes Matricule et Statut, avec l'en-tête en première ligne.",
            'cantina.gestao.import.erro': "Erreur d'importation :",
            'cantina.gestao.import.nao.aplicada': 'Importation non appliquée :',
            'cantina.gestao.import.regra.a': 'En-tête en',
            'cantina.gestao.import.regra.b': 'première ligne',
            'cantina.gestao.import.regra.c': '. Les colonnes sont lues par leur',
            'cantina.gestao.import.regra.d': 'nom',
            'cantina.gestao.import.regra.e': "— accents, majuscules et espaces sont ignorés.",
            'cantina.gestao.col.coluna': 'Colonne',
            'cantina.gestao.col.obrigatoria': 'Obligatoire',
            'cantina.gestao.col.aceitos': 'Noms acceptés',
            'cantina.gestao.nota.status': 'accepte le portugais, le français ou le nom système :',
            'cantina.gestao.nota.ignorado.a': "Un élève absent du MAGBO est ignoré",
            'cantina.gestao.nota.ignorado.b': ", jamais créé — la base élèves vient de l'importation Pronote.",
            'cantina.gestao.nota.sem.mudanca.a': 'Une ligne qui ne changerait rien apparaît comme',
            'cantina.gestao.nota.dry.run': "Rien n'est écrit avant que vous vérifiiez et confirmiez.",
            'cantina.gestao.nota.zeros.a': 'La matricule a des',
            'cantina.gestao.nota.zeros.b': 'zéros en tête',
            'cantina.gestao.nota.zeros.c': 'Formatez la colonne en',
            'cantina.gestao.nota.zeros.d': 'Texte',
            'cantina.gestao.nota.zeros.e': "avant d'enregistrer — Excel la transforme en nombre, mange le zéro, et plus aucune ligne ne correspond au registre.",
            'cantina.gestao.simulado': "Simulation vérifiée — rien n'a encore été écrit.",
            'cantina.gestao.aplicado.titulo': 'Importation appliquée',
            'cantina.gestao.aplicado.criados': 'Créés : {n}',
            'cantina.gestao.aplicado.atualizados': 'Mis à jour : {n}',
            'cantina.gestao.aplicado.ignorados': 'Ignorés : {n}',
            'cantina.gestao.aplicado.conflitos': 'Conflits : {n}',
            'cantina.gestao.kpi.autorizados': 'Total autorisés',
            'cantina.gestao.kpi.nao.autorizados': 'Total non autorisés',
            'cantina.gestao.kpi.pendentes': 'En attente',
            'cantina.gestao.kpi.alunos': 'Total élèves',
            'cantina.gestao.busca': 'Rechercher par nom ou matricule...',
            'cantina.gestao.todas.turmas': 'Toutes les classes',
            'cantina.gestao.todos.status': 'Tous les statuts',
            'cantina.gestao.status.autorizado': 'Autorisé',
            'cantina.gestao.status.nao.autorizado': 'Non autorisé',
            'cantina.gestao.carregando': 'Chargement des droits...',
            'cantina.gestao.vazio': 'Aucun résultat trouvé.',
            'cantina.gestao.col.aluno': 'Élève',
            'cantina.gestao.col.direito': 'Statut du droit',
            'cantina.gestao.col.modif': 'Dernière modif.',
            'cantina.gestao.historico': "Voir l'historique",

            'plano.criar': 'Créer',
            'plano.atualizar': 'Mettre à jour',
            'plano.ignorar': 'ignorer',
            'plano.conflito': 'Conflit',
            'plano.linhas': '{n} lignes',
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
            'acao.editar': 'Editar',
            'acao.desativar': 'Desativar',
            'acao.salvar': 'Salvar',
            'acao.descartar': 'Descartar',

            'comum.nome': 'Nome',
            'comum.id': 'ID',
            'comum.ativo': 'Ativo',
            'comum.inativo': 'Inativo',
            'comum.sim': 'sim',
            'comum.nao': 'não',
            'comum.erro.salvar': 'Erro ao salvar',
            'comum.salvando': 'Salvando...',

            'usuarios.titulo': 'Usuários cadastrados',
            'usuarios.subtitulo': 'Gerencie alunos, professores, funcionários e responsáveis',
            'usuarios.erro.carregar': 'Erro ao carregar usuários',
            'usuarios.desativar.confirma': 'Desativar este usuário? Ele não poderá mais acessar os setores.',
            'usuarios.desativado': 'Usuário desativado.',
            'usuarios.atualizado': 'Usuário atualizado.',
            'usuarios.mostrar.inativos': 'Mostrar inativos',
            'usuarios.busca': 'Buscar por nome ou ID...',
            'usuarios.carregando': 'Carregando usuários...',
            'usuarios.vazio': 'Nenhum usuário encontrado.',
            'usuarios.editar.titulo': 'Editar usuário',
            'usuarios.editar.subtitulo': 'Editando dados de',
            'usuarios.nome.completo': 'Nome completo',
            'usuarios.turma.se.aluno': 'Turma (se aluno)',
            'usuarios.turma.exemplo': 'Ex: 1A, 2B...',
            'usuarios.telefone': 'Telefone',
            'usuarios.parentesco.exemplo': 'Ex: pai, mãe...',

            'operadores.titulo': 'Operadores do sistema',
            'operadores.subtitulo': 'Gerencie quem pode operar cada setor',
            'operadores.novo': 'Novo operador',
            'operadores.editar': 'Editar operador',
            'operadores.novo.subtitulo': 'Preencha os dados do novo operador',
            'operadores.desativar.confirma': 'Desativar este operador?\n\nEle deixa de conseguir entrar no sistema imediatamente. Nada é apagado: o histórico e os registros feitos por ele permanecem, e a conta pode ser reativada depois pelo lápis de edição.',
            'operadores.senha.titulo': 'Pedidos de redefinição de senha ({n})',
            'operadores.senha.dica': 'Redefina a senha do operador no lápis da lista abaixo e então marque o pedido como tratado',
            'operadores.senha.tratado': 'Marcar tratado',
            'operadores.senha.rodape': 'Redefina a senha pelo lápis do operador na lista abaixo; um nome que não existe na lista é alguém que errou o nome da conta.',
            'operadores.carregando': 'Carregando operadores...',
            'operadores.col.usuario': 'Usuário',
            'operadores.col.role': 'Papel',
            'operadores.col.setores': 'Setores',
            'operadores.col.ultimo.login': 'Último login',
            'operadores.campo.login': 'Usuário (login)',
            'operadores.campo.login.exemplo': 'ex: biblio1',
            'operadores.campo.nome': 'Nome completo',
            'operadores.campo.setores': 'Setores autorizados',
            'operadores.setor.cantine': 'Cantina',
            'operadores.setor.infirmerie': 'Enfermaria',
            'operadores.setor.cdi': 'CDI',
            'operadores.setor.portail': 'Portaria (entradas)',
            'operadores.setor.tudo': 'Tudo (admin)',
            'operadores.senha': 'Senha',
            'operadores.senha.nova': 'Nova senha (opcional)',
            'operadores.ativo': 'Operador ativo',

            'saidas.titulo': 'Controle de saídas',
            'saidas.subtitulo': 'Gerencie as autorizações de saída de alunos.',
            'saidas.erro.carregar': 'Erro ao carregar permissões.',
            'saidas.revogar.confirma': 'Revogar esta autorização de saída?\n\nO aluno passa a ser barrado na saída imediatamente. A revogação não pode ser desfeita — para autorizar de novo, crie uma nova autorização. O registro revogado permanece no histórico, com quem revogou e quando.',
            'saidas.revogar.motivo': 'Revogado manualmente pela portaria',
            'saidas.nova': 'Nova autorização',
            'saidas.ativas': 'Autorizações ativas',
            'saidas.vazio': 'Nenhuma autorização ativa no momento.',
            'saidas.col.aluno': 'Aluno',
            'saidas.col.validade': 'Validade',
            'saidas.col.responsavel': 'Autorizado por / Nota',
            'saidas.col.acoes': 'Ações',
            'saidas.de': 'De:',
            'saidas.ate': 'Até:',
            'saidas.revogar': 'Revogar',
            'saidas.feed.titulo': 'Tentativas negadas — Portaria',
            'saidas.selecione.aluno': 'Selecione o aluno pelo nome antes de salvar.',
            'saidas.nova.titulo': 'Nova autorização de saída',
            'saidas.trocar': 'Trocar',
            'saidas.busca.aluno': 'Buscar pelo nome (ou matrícula)...',
            'saidas.busca.vazia': 'Nenhum aluno com esse nome. Confira a grafia — a busca ignora acentos e maiúsculas.',
            'saidas.busca.minimo': 'Digite ao menos {n} letras do nome.',
            'saidas.autoridades.titulo': 'Quem autorizou',
            'saidas.autoridade.familia': 'Família (responsável)',
            'saidas.autoridade.familia.exemplo': 'Pai, mãe ou guardião',
            'saidas.autoridade.familia.curta': 'Família',
            'saidas.autoridade.escola': 'Escola (Vie Scolaire)',
            'saidas.autoridade.escola.exemplo': 'Membro da Vie Scolaire',
            'saidas.autoridade.escola.curta': 'Escola',
            'saidas.autoridades.regra.a': 'Preencha',
            'saidas.autoridades.regra.b': 'pelo menos uma',
            'saidas.autoridades.regra.c': 'das duas. As duas juntas quando a família autorizou e a Vie Scolaire referendou.',
            'saidas.tipo': 'Tipo de autorização',
            'saidas.tipo.unica': 'Saída única (data/hora específica)',
            'saidas.tipo.recorrente': 'Recorrente (dias da semana)',
            'saidas.campo.saida': 'Saída',
            'saidas.campo.retorno': 'Retorno (máx)',
            'saidas.campo.hora.inicio': 'Hora de início',
            'saidas.campo.hora.fim': 'Hora de fim',
            'saidas.campo.dias': 'Dias autorizados',
            'saidas.campo.obs': 'Observações (opcional)',
            'saidas.salvar': 'Salvar autorização',

            'cantina.hist.titulo': 'Histórico de acesso à cantina',
            'cantina.hist.erro': 'Erro ao carregar o histórico.',
            'cantina.hist.carregando': 'Carregando o histórico...',
            'cantina.hist.vazio': 'Nenhum histórico disponível',
            'cantina.hist.import': 'Importação',
            'cantina.hist.manual': 'Manual',
            'cantina.hist.validade': 'Validade',
            'cantina.hist.nota': 'Nota',
            'cantina.hist.por': 'Por',
            'cantina.hist.sistema': 'Sistema',

            'cantina.gestao.titulo': 'Gestão da Cantina',
            'cantina.gestao.subtitulo': 'Gerencie os direitos de refeição dos alunos.',
            'cantina.gestao.erro.carregar': 'Erro ao carregar os dados.',
            'cantina.gestao.sem.permissao': 'Você não tem autorização para alterar este direito.',
            'cantina.gestao.motivo.ui': 'Alterado pela interface da cantina',
            'cantina.gestao.xlsx.ausente': 'A biblioteca XLSX não está carregada.',
            'cantina.gestao.importar': 'Importar lista (XLSX)',
            'cantina.gestao.lendo': 'Lendo...',
            'cantina.gestao.import.titulo': 'Importar lista de direitos (.xlsx)',
            'cantina.gestao.import.nada': 'Nenhuma linha reconhecida. Confira se a planilha tem as colunas Matrícula e Status, com o cabeçalho na primeira linha.',
            'cantina.gestao.import.erro': 'Erro de importação:',
            'cantina.gestao.import.nao.aplicada': 'Importação não aplicada:',
            'cantina.gestao.import.regra.a': 'Cabeçalho na',
            'cantina.gestao.import.regra.b': 'primeira linha',
            'cantina.gestao.import.regra.c': '. As colunas são lidas pelo',
            'cantina.gestao.import.regra.d': 'nome',
            'cantina.gestao.import.regra.e': '— acento, maiúscula e espaço não importam.',
            'cantina.gestao.col.coluna': 'Coluna',
            'cantina.gestao.col.obrigatoria': 'Obrigatória',
            'cantina.gestao.col.aceitos': 'Nomes aceitos',
            'cantina.gestao.nota.status': 'aceita português, francês ou o nome do sistema:',
            'cantina.gestao.nota.ignorado.a': 'Aluno que não está no MAGBO é ignorado',
            'cantina.gestao.nota.ignorado.b': ', nunca criado — o cadastro de aluno vem da importação Pronote.',
            'cantina.gestao.nota.sem.mudanca.a': 'Linha que não mudaria nada aparece como',
            'cantina.gestao.nota.dry.run': 'Nada é gravado antes de você conferir e confirmar.',
            'cantina.gestao.nota.zeros.a': 'A matrícula tem',
            'cantina.gestao.nota.zeros.b': 'zeros à esquerda',
            'cantina.gestao.nota.zeros.c': 'Formate a coluna como',
            'cantina.gestao.nota.zeros.d': 'Texto',
            'cantina.gestao.nota.zeros.e': 'antes de salvar — o Excel a transforma em número, come o zero, e aí nenhuma linha casa com o cadastro.',
            'cantina.gestao.simulado': 'Simulação conferida — nada foi gravado ainda.',
            'cantina.gestao.aplicado.titulo': 'Importação aplicada',
            'cantina.gestao.aplicado.criados': 'Criados: {n}',
            'cantina.gestao.aplicado.atualizados': 'Atualizados: {n}',
            'cantina.gestao.aplicado.ignorados': 'Ignorados: {n}',
            'cantina.gestao.aplicado.conflitos': 'Conflitos: {n}',
            'cantina.gestao.kpi.autorizados': 'Total autorizados',
            'cantina.gestao.kpi.nao.autorizados': 'Total não autorizados',
            'cantina.gestao.kpi.pendentes': 'Pendentes',
            'cantina.gestao.kpi.alunos': 'Total de alunos',
            'cantina.gestao.busca': 'Buscar por nome ou matrícula...',
            'cantina.gestao.todas.turmas': 'Todas as turmas',
            'cantina.gestao.todos.status': 'Todos os status',
            'cantina.gestao.status.autorizado': 'Autorizado',
            'cantina.gestao.status.nao.autorizado': 'Não autorizado',
            'cantina.gestao.carregando': 'Carregando os direitos...',
            'cantina.gestao.vazio': 'Nenhum resultado encontrado.',
            'cantina.gestao.col.aluno': 'Aluno',
            'cantina.gestao.col.direito': 'Status do direito',
            'cantina.gestao.col.modif': 'Última modif.',
            'cantina.gestao.historico': 'Ver o histórico',

            'plano.criar': 'Criar',
            'plano.atualizar': 'Atualizar',
            'plano.ignorar': 'ignorar',
            'plano.conflito': 'Conflito',
            'plano.linhas': '{n} linhas',
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
