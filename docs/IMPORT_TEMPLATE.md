# Template de Importação de Usuários (Excel)

Para importar usuários em massa para o sistema MAGBO Access Control, utilize uma planilha Excel (`.xlsx` ou `.xls`) com as seguintes colunas (na primeira linha):

| ID | Nome | Tipo | Turma | ResponsavelId | Parentesco | Telefone | Foto |
|:---|:---|:---|:---|:---|:---|:---|:---|

## Regras de Validação (Obrigatórias)

### 1. Colunas e Tipos
- **ID**: Obrigatório. Não pode ser gerado automaticamente. Segue os padrões institucionais:
  - **ALUNO**: 7 dígitos numéricos (ex: `1234567`)
  - **RESPONSAVEL**: Começa com `R` seguido de 4 ou mais dígitos (ex: `R0001`)
  - **PROFESSOR**: Começa com `P` seguido de 4 ou mais dígitos (ex: `P0001`)
  - **FUNCIONARIO**: Começa com `F` seguido de 4 ou mais dígitos (ex: `F0001`)
- **Nome**: Obrigatório para todos os usuários.
- **Tipo**: Obrigatório e deve ser exatamente um de: `ALUNO`, `PROFESSOR`, `FUNCIONARIO`, `RESPONSAVEL` (todas em maiúsculo). Não há fallback.
- **Turma**: Obrigatória APENAS se o `Tipo` for `ALUNO`.
- **ResponsavelId**: Opcional. Se fornecido (normalmente para alunos), o ID deve corresponder a um RESPONSÁVEL já cadastrado no sistema (ou presente na mesma planilha de importação).
- **Parentesco**: Opcional (usado apenas para RESPONSAVEL).
- **Telefone**: Opcional (usado apenas para RESPONSAVEL).
- **Foto**: Opcional. URL para foto de perfil.

### 2. Comportamento do Bulk Import
- **Criação Apenas**: A importação em massa serve apenas para **CADASTRAR** novos usuários. Ela **não sobrescreve** registros já existentes. Se um ID já existir na base, a linha será rejeitada.
- **Ordem de Processamento**: O sistema processará os responsáveis primeiro, mesmo se estiverem no final da planilha, para garantir que as referências de `ResponsavelId` sejam resolvidas corretamente.
- **Falhas Parciais**: Se houverem erros em algumas linhas (ex: tipo inválido ou duplicata), essas linhas serão ignoradas (com erro detalhado na interface), enquanto as linhas válidas da planilha serão inseridas com sucesso.
