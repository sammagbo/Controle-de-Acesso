// =====================================================================
// CONSTANTES DE CONFIGURAÇÃO DA UI
// Estas constantes definem a estrutura física do Lycée e o tema visual
// da aplicação. NÃO são dados mockados — não devem ser substituídas
// por dados do backend.
// =====================================================================


// ---------------------------------------------------------------------
// PONTOS DE ACESSO — Estrutura física do Lycée
// Define os locais controlados pelo sistema de controle de acesso.
// Alterar aqui reflete em toda a UI (SectorView, Dashboard, etc.)
// ---------------------------------------------------------------------
const ACCESS_POINTS = [
      { id: 'PORT1',  nome: 'Portail Principal',    icon: 'door-open',        description: 'Entrée principale',       category: 'portaria', area: 'portail' },
      { id: 'PORT2',  nome: 'Portail Terrain',       icon: 'door-closed',      description: 'Entrée latérale nord',    category: 'portaria', area: 'portail' },
      { id: 'PORT3',  nome: 'Garage',                icon: 'door-closed',      description: 'Entrée latérale sud',     category: 'portaria', area: 'portail' },
      { id: 'BIBLIO', nome: 'CDI',                   icon: 'book-open',        description: 'Centre de Documentation', category: 'especial', area: 'cdi' },
      { id: 'ENFERM', nome: 'Infirmerie',            icon: 'heart-pulse',      description: 'Poste de soins',          category: 'especial', area: 'infirmerie' },
      { id: 'REFEI1', nome: 'Cantine Principale',    icon: 'utensils',         description: 'Réfectoire 1',            category: 'refeitorio', area: 'cantine' },
      { id: 'REFEI2', nome: 'Cantine Secondaire',    icon: 'utensils-crossed', description: 'Réfectoire 2',            category: 'refeitorio', area: 'cantine' },
      { id: 'CANTINA_MONITOR', nome: 'Surveillance Cantine', icon: 'monitor', description: 'Temps réel', category: 'monitor', area: 'cantine' },
      { id: 'CANTINA_REPORT',  nome: 'Rapport Cantine', icon: 'file-text', description: 'Historique et export',   category: 'monitor', area: 'cantine' },
      { id: 'INFIRMARY_REPORT', nome: 'Rapport Infirmerie', icon: 'clipboard-list', description: 'Visites et séjours', category: 'monitor', area: 'infirmerie' },
      { id: 'GENERAL_REPORT',   nome: 'Rapport Général',    icon: 'layout-dashboard', description: 'Vue consolidée — KPIs, élèves, journal', category: 'monitor', area: 'admin', hidden: true },
      { id: 'MEAL_ENTITLEMENT_MANAGEMENT', nome: 'Droits Repas', icon: 'utensils', description: 'Gestion des droits', category: 'monitor', area: 'admin', hidden: true },
      // Planning da cantina (V021). `hidden` como as outras telas de gestão:
      // entra-se pelo Painel Administrativo, ou pelo atalho de quem tem a
      // permissão granular.
      { id: 'MEAL_SLOT_MANAGEMENT', nome: 'Planning Cantine', icon: 'calendar-clock', description: 'Créneaux de restauration', category: 'monitor', area: 'admin', hidden: true },
      // Exclusions du CDI (V025). `hidden` : donnée sensible sur mineur —
      // on y entre par le Panneau Administratif ou par le raccourci de qui
      // détient CDI_EXCLUSION_WRITE, jamais depuis le tableau de bord public.
      { id: 'CDI_EXCLUSION_MANAGEMENT', nome: 'Exclusions CDI', icon: 'user-x', description: 'Qui ne doit pas entrer au CDI', category: 'monitor', area: 'admin', hidden: true },
      // Configuration du systeme (V024 + catalogue). `hidden` : ce n'est pas
      // une preference d'affichage — ces valeurs decident si une passage est
      // signalee et si le CDI se dit plein. On y entre par le Panneau
      // Administratif, ou par le raccourci de qui detient CONFIG_WRITE.
      { id: 'SYSTEM_CONFIGURATION', nome: 'Configuration', icon: 'sliders-horizontal', description: 'Tous les reglages, par domaine', category: 'monitor', area: 'admin', hidden: true },
      { id: 'EXIT_PERMISSION_MANAGEMENT', nome: 'Sorties', icon: 'door-open', description: 'Gestion des autorisations', category: 'monitor', area: 'admin', hidden: true },
      // Régime de sortie — o direito ANUAL, distinto das autorizações pontuais
      // acima. As duas telas coexistem porque as duas coisas coexistem
      // (circulaire 96-248): o regime é a regra do ano, a autorização é a
      // exceção do dia, e a exceção vence.
      { id: 'REGIME_MANAGEMENT', nome: 'Régimes', icon: 'scroll-text', description: 'Régime de sortie annuel', category: 'monitor', area: 'admin', hidden: true },
      // ⚠️ O card segue a permissao PPMS_READ (js/components/Dashboard.js), nao a
      // area: a lista e nominativa e o dono decidiu RESTRINGIR, nao fechar —
      // Vie Scolaire, direcao e enfermaria. O `sempreVisivel` anterior espelhava
      // um endpoint isAuthenticated() que deixou de existir.
      // PPMS — NAO hidden e NAO restrito a 'admin': numa evacuacao quem tem o
      // telefone na mao precisa alcancar a lista, e procurar o caminho no meio
      // de uma evacuacao e o mesmo que nao ter a tela.
      { id: 'PPMS', nome: 'PPMS', icon: 'siren', description: 'Qui est à l’intérieur', category: 'monitor', area: 'portail' },
];


// ---------------------------------------------------------------------
// TIPO_LABELS — Mapeamento de tipo de usuário → rótulo e tema visual
// Usado em badges, cards e filtros para exibir o tipo de forma
// consistente em toda a aplicação.
// ---------------------------------------------------------------------
// ⚠️ Desde 14/08/2026 este mapa é SÓ TEMA VISUAL: os rótulos moram nos
// dicionários do i18n (chaves `enum.tipo.*` em js/utils/i18n.js) e chegam
// pela MagboI18n.tEnum('tipo', valor) — cor é tema, não idioma.
const TIPO_LABELS = {
      ALUNO:       { color: 'bg-accent-500',  textColor: 'text-white' },
      PROFESSOR:   { color: 'bg-navy-500',    textColor: 'text-white' },
      FUNCIONARIO: { color: 'bg-slate-600',   textColor: 'text-white' },
      RESPONSAVEL: { color: 'bg-purple-600',  textColor: 'text-white' },
};


// ---------------------------------------------------------------------
// CATEGORY_COLORS — Paleta visual por categoria de ponto de acesso
// Mapeia a propriedade `category` de ACCESS_POINTS para tokens CSS
// usados nos cards de setor (background, ícone, anel de foco).
// ---------------------------------------------------------------------
const CATEGORY_COLORS = {
      portaria:   { bg: 'bg-accent-500',  iconBg: 'bg-accent-600',  ring: 'ring-accent-200'  },
      especial:   { bg: 'bg-warning-500', iconBg: 'bg-warning-600', ring: 'ring-warning-200' },
      refeitorio: { bg: 'bg-success-500', iconBg: 'bg-success-600', ring: 'ring-success-200' },
      monitor:    { bg: 'bg-navy-500',    iconBg: 'bg-navy-600',    ring: 'ring-navy-200'    },
};

// ---------------------------------------------------------------------
// RÓTULOS DE ENUM → MUDARAM DE CASA (14/08/2026)
// ---------------------------------------------------------------------
// DENIAL_REASON_LABELS, AUTH_METHOD_LABELS, ENTITLEMENT_STATUS_LABELS,
// EXIT_PERMISSION_TYPE_LABELS e EXIT_PERMISSION_STATUS_LABELS viviam aqui
// como mapas estáticos NUM idioma só — francês fixo mesmo com a tela em
// português. Agora são chaves `enum.<grupo>.<VALOR>` nos dicionários de
// js/utils/i18n.js, servidas por MagboI18n.tEnum(grupo, valor).
// A regra do espelho continua a mesma e viajou junto: valor novo num enum
// do BACKEND exige a chave nova nos DOIS dicionários, na MESMA entrega.



// ---------------------------------------------------------------------
// pointLabel — NOME do ponto, nunca o código sozinho
// ---------------------------------------------------------------------
// Varredura de 11/08/2026: várias telas escreviam `p ? p.nome : id`, e um
// ponto fora de ACCESS_POINTS aparecia como "PORT1" seco — para o leitor,
// mesma classe de problema da matrícula no lugar do nome, só que mais raro
// (ponto novo comissionado antes de entrar aqui). O fallback continua
// trazendo o código, porque é o único identificador que existe — mas
// rotulado como ponto, para não parecer sigla que o leitor deveria saber.
function pointLabel(pointId, lang) {
      const p = ACCESS_POINTS.find(pt => pt.id === pointId);
      if (p) return p.nome;
      const id = (pointId == null || String(pointId).trim() === '') ? '?' : String(pointId);
      return (lang === 'pt' ? 'Ponto ' : 'Point ') + id;
}


