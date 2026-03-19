-- ==========================================
-- SEED DE DADOS PARA TESTES DE QA E AUDITORIA
-- ==========================================

-- Responsaveis
INSERT INTO responsaveis (id, nome, parentesco, telefone, foto_url) VALUES 
('R001', 'Marie Dupont', 'Mãe', '+33 6 12 34 56 78', 'https://api.dicebear.com/7.x/initials/svg?seed=M&backgroundColor=8B5CF6'),
('R002', 'Jean-Pierre Martin', 'Pai', '+33 6 98 76 54 32', 'https://api.dicebear.com/7.x/initials/svg?seed=J&backgroundColor=3B82F6'),
('R003', 'Sophie Bernard', 'Mãe', '+33 6 55 44 33 22', 'https://api.dicebear.com/7.x/initials/svg?seed=S&backgroundColor=EC4899'),
('R004', 'Claude Moreau', 'Pai', '+33 6 11 22 33 44', 'https://api.dicebear.com/7.x/initials/svg?seed=C&backgroundColor=10B981'),
('R005', 'Isabelle Leroy', 'Mãe', '+33 6 77 88 99 00', 'https://api.dicebear.com/7.x/initials/svg?seed=I&backgroundColor=F59E0B')
ON CONFLICT (id) DO NOTHING;

-- App Users (Alunos, Professores e Funcionários)
INSERT INTO app_users (id, nome, tipo, turma, responsavel_id, foto_url, meal_count) VALUES
('A001', 'Lucas Dupont', 'ALUNO', '6ème A', 'R001', 'https://api.dicebear.com/7.x/initials/svg?seed=LD&backgroundColor=3B82F6', 0),
('A002', 'Emma Martin', 'ALUNO', '6ème B', 'R002', 'https://api.dicebear.com/7.x/initials/svg?seed=EM&backgroundColor=8B5CF6', 0),
('A003', 'Hugo Bernard', 'ALUNO', '5ème A', 'R003', 'https://api.dicebear.com/7.x/initials/svg?seed=HB&backgroundColor=EC4899', 0),
('A004', 'Léa Moreau', 'ALUNO', '5ème B', 'R004', 'https://api.dicebear.com/7.x/initials/svg?seed=LM&backgroundColor=10B981', 0),
('A005', 'Nathan Leroy', 'ALUNO', '4ème A', 'R005', 'https://api.dicebear.com/7.x/initials/svg?seed=NL&backgroundColor=F59E0B', 0),
('A006', 'Chloé Petit', 'ALUNO', '4ème B', 'R001', 'https://api.dicebear.com/7.x/initials/svg?seed=CP&backgroundColor=EF4444', 0),
('A007', 'Gabriel Roux', 'ALUNO', '3ème A', 'R002', 'https://api.dicebear.com/7.x/initials/svg?seed=GR&backgroundColor=6366F1', 0),
('A008', 'Manon Fournier', 'ALUNO', '3ème B', 'R003', 'https://api.dicebear.com/7.x/initials/svg?seed=MF&backgroundColor=14B8A6', 0),
('P001', 'Prof. Catherine Blanc', 'PROFESSOR', 'Mathématiques', NULL, 'https://api.dicebear.com/7.x/initials/svg?seed=CB&backgroundColor=0C1B3A', 0),
('P002', 'Prof. Michel Duval', 'PROFESSOR', 'Histoire-Géo', NULL, 'https://api.dicebear.com/7.x/initials/svg?seed=MD&backgroundColor=0C1B3A', 0),
('F001', 'Pierre Lambert', 'FUNCIONARIO', 'Manutenção', NULL, 'https://api.dicebear.com/7.x/initials/svg?seed=PL&backgroundColor=64748B', 0)
ON CONFLICT (id) DO NOTHING;
