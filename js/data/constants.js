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
      { id: 'PORT1',  nome: 'Portail Principal',    icon: 'door-open',        description: 'Entrada Principal',        category: 'portaria'  },
      { id: 'PORT2',  nome: 'Portail Terrain',       icon: 'door-closed',      description: 'Entrada Lateral Norte',    category: 'portaria'  },
      { id: 'PORT3',  nome: 'Garage',                icon: 'door-closed',      description: 'Entrada Lateral Sul',      category: 'portaria'  },
      { id: 'BIBLIO', nome: 'CDI - Biblioteca',      icon: 'book-open',        description: 'Centre de Documentation', category: 'especial'  },
      { id: 'ENFERM', nome: 'Infirmerie',            icon: 'heart-pulse',      description: 'Enfermaria',              category: 'especial'  },
      { id: 'REFEI1', nome: 'Cantine Principale',    icon: 'utensils',         description: 'Refeitório 1',            category: 'refeitorio' },
      { id: 'REFEI2', nome: 'Cantine Secondaire',    icon: 'utensils-crossed', description: 'Refeitório 2',            category: 'refeitorio' },
];


// ---------------------------------------------------------------------
// TIPO_LABELS — Mapeamento de tipo de usuário → rótulo e tema visual
// Usado em badges, cards e filtros para exibir o tipo de forma
// consistente em toda a aplicação.
// ---------------------------------------------------------------------
const TIPO_LABELS = {
      ALUNO:       { label: 'Aluno',       color: 'bg-accent-500',  textColor: 'text-white' },
      PROFESSOR:   { label: 'Professor',   color: 'bg-navy-500',    textColor: 'text-white' },
      FUNCIONARIO: { label: 'Funcionário', color: 'bg-slate-600',   textColor: 'text-white' },
      RESPONSAVEL: { label: 'Responsável', color: 'bg-purple-600',  textColor: 'text-white' },
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
};
