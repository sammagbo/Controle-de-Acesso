# Dados de demonstração

Alunos fictícios da instância demo local usada pelo vídeo do portfólio (`video/capture/`).
Nunca carregar numa instalação real: a sincronização Pronote desativa toda pessoa ativa que não está no arquivo.

- Os nomes são visivelmente fictícios (Exemple, Démo, Fictif) e não há fotos: as telas mostram as iniciais.
- Os IDs têm sete dígitos e começam por 9 (9000001…), para nunca coincidir com um aluno real.
- `eleves-demo.csv` usa o formato do export Pronote lido por `CsvPronoteDataSource`, com cabeçalho:
  `userId;nome;tipo;turma;responsavelId;responsavelNome;responsavelParentesco;responsavelTelefone`.

`video/capture/seed.mjs` copia o arquivo para dentro do backend da demo e importa pelo `POST /api/pronote/sync`.
