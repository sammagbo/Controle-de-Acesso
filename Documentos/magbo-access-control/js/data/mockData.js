// =====================================================================
// MOCK DATABASE
// =====================================================================

const RESPONSAVEIS = [
      { id: 'R001', nome: 'Marie Dupont', tipo: 'RESPONSAVEL', turma: null, foto_url: null, telefone: '+33 6 12 34 56 78' },
      { id: 'R002', nome: 'Jean-Pierre Martin', tipo: 'RESPONSAVEL', turma: null, foto_url: null, telefone: '+33 6 98 76 54 32' },
      { id: 'R003', nome: 'Sophie Bernard', tipo: 'RESPONSAVEL', turma: null, foto_url: null, telefone: '+33 6 55 44 33 22' },
      { id: 'R004', nome: 'Claude Moreau', tipo: 'RESPONSAVEL', turma: null, foto_url: null, telefone: '+33 6 11 22 33 44' },
      { id: 'R005', nome: 'Isabelle Leroy', tipo: 'RESPONSAVEL', turma: null, foto_url: null, telefone: '+33 6 77 88 99 00' },
];

const USERS = [
      // Alunos
      { id: 'A001', nome: 'Lucas Dupont', tipo: 'ALUNO', turma: '6ème A', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=LD&backgroundColor=3B82F6', responsavel_id: 'R001' },
      { id: 'A002', nome: 'Emma Martin', tipo: 'ALUNO', turma: '6ème B', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=EM&backgroundColor=8B5CF6', responsavel_id: 'R002' },
      { id: 'A003', nome: 'Hugo Bernard', tipo: 'ALUNO', turma: '5ème A', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=HB&backgroundColor=EC4899', responsavel_id: 'R003' },
      { id: 'A004', nome: 'Léa Moreau', tipo: 'ALUNO', turma: '5ème B', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=LM&backgroundColor=10B981', responsavel_id: 'R004' },
      { id: 'A005', nome: 'Nathan Leroy', tipo: 'ALUNO', turma: '4ème A', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=NL&backgroundColor=F59E0B', responsavel_id: 'R005' },
      { id: 'A006', nome: 'Chloé Petit', tipo: 'ALUNO', turma: '4ème B', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=CP&backgroundColor=EF4444', responsavel_id: 'R001' },
      { id: 'A007', nome: 'Gabriel Roux', tipo: 'ALUNO', turma: '3ème A', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=GR&backgroundColor=6366F1', responsavel_id: 'R002' },
      { id: 'A008', nome: 'Manon Fournier', tipo: 'ALUNO', turma: '3ème B', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=MF&backgroundColor=14B8A6', responsavel_id: 'R003' },
      // Professores
      { id: 'P001', nome: 'Prof. Catherine Blanc', tipo: 'PROFESSOR', turma: 'Mathématiques', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=CB&backgroundColor=0C1B3A' },
      { id: 'P002', nome: 'Prof. Michel Duval', tipo: 'PROFESSOR', turma: 'Histoire-Géo', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=MD&backgroundColor=0C1B3A' },
      { id: 'P003', nome: 'Prof. Anne-Marie Simon', tipo: 'PROFESSOR', turma: 'Français', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=AS&backgroundColor=0C1B3A' },
      // Funcionários
      { id: 'F001', nome: 'Pierre Lambert', tipo: 'FUNCIONARIO', turma: 'Manutenção', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=PL&backgroundColor=64748B' },
      { id: 'F002', nome: 'Nathalie Girard', tipo: 'FUNCIONARIO', turma: 'Secretaria', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=NG&backgroundColor=64748B' },
      { id: 'F003', nome: 'François Bonnet', tipo: 'FUNCIONARIO', turma: 'Segurança', foto_url: 'https://api.dicebear.com/7.x/initials/svg?seed=FB&backgroundColor=64748B' },
      // Responsáveis
      ...RESPONSAVEIS,
];

const ACCESS_POINTS = [
      { id: 'PORT1', nome: 'Portaria 1', icon: 'door-open', description: 'Entrada Principal', category: 'portaria' },
      { id: 'PORT2', nome: 'Portaria 2', icon: 'door-closed', description: 'Entrada Lateral Norte', category: 'portaria' },
      { id: 'PORT3', nome: 'Portaria 3', icon: 'door-closed', description: 'Entrada Lateral Sul', category: 'portaria' },
      { id: 'BIBLIO', nome: 'Biblioteca', icon: 'book-open', description: 'Centre de Documentation', category: 'especial' },
      { id: 'ENFERM', nome: 'Enfermaria', icon: 'heart-pulse', description: 'Infirmerie', category: 'especial' },
      { id: 'REFEI1', nome: 'Refeitório 1', icon: 'utensils', description: 'Cantine Principale', category: 'refeitorio' },
      { id: 'REFEI2', nome: 'Refeitório 2', icon: 'utensils-crossed', description: 'Cantine Secondaire', category: 'refeitorio' },
];

const TIPO_LABELS = {
      ALUNO: { label: 'Aluno', color: 'bg-accent-500', textColor: 'text-white' },
      PROFESSOR: { label: 'Professor', color: 'bg-navy-500', textColor: 'text-white' },
      FUNCIONARIO: { label: 'Funcionário', color: 'bg-slate-600', textColor: 'text-white' },
      RESPONSAVEL: { label: 'Responsável', color: 'bg-purple-600', textColor: 'text-white' },
};

const CATEGORY_COLORS = {
      portaria: { bg: 'bg-accent-500', iconBg: 'bg-accent-600', ring: 'ring-accent-200' },
      especial: { bg: 'bg-warning-500', iconBg: 'bg-warning-600', ring: 'ring-warning-200' },
      refeitorio: { bg: 'bg-success-500', iconBg: 'bg-success-600', ring: 'ring-success-200' },
};
