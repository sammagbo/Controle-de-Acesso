# Dívidas de interface — levantamento de 12/08/2026

Origem: varredura pedida pelo Sam ("liste problemas que ninguém pediu — eu
escolho"). Do levantamento original, **dois itens foram corrigidos na hora**
por serem de segurança (branch `fix/counters-charts-and-ui`): as ações
destrutivas passaram a dizer o que se perde, e o voltar passou a existir em
janela estreita. **O resto está aqui, como dívida consciente** — cada item com
o custo de ficar como está, para a priorização ser informada.

| # | Dívida | Onde | Custo de não fazer |
|---|---|---|---|
| 1 | `AppSettingsModal` faz sete trabalhos (~1900 linhas: alunos, HikCentral, CSV reverso, servidores, fotos, reclassificação, casamento manual) | `js/components/AppSettingsModal.js` | Toda mudança mexe num arquivo gigante; o operador vê abas que não pode usar (a autorização real está nos endpoints, mas a tela aparece inteira pelo cog do header) |
| 2 | `alert()`/`prompt()` bloqueantes no CDI, Toast no resto do app | `js/cdi/SettingsModal.js` (import, restauração, senha do backup) | Duas linguagens de aviso; alert congela a tela do kiosk |
| 3 | Operações longas sem progresso | importação de alunos em lote, ZIP de ~1200 fotos | O operador não sabe se travou; risco de fechar no meio |
| 4 | Três vocabulários de período | Journal (`<input date>`), ParEleve ("Aujourd'hui/7 jours/30 jours"), Vue d'ensemble ("Aujourd'hui/Cette semaine/Ce mois/Personnalisé") | Quem cruza telas nunca sabe se "semana" é a mesma semana; ver também a nota da Durée moyenne no smoke checklist |
| 5 | Mistura PT/FR em toda a interface | Dashboard PT, Rapport FR, feeds PT | É o projeto de tradução já adiado de propósito (fundação: `js/utils/i18n.js`, só o login migrado) — **decisão registrada, não esquecimento** |
| 6 | Feed de negadas sem botão "Réessayer" no erro | `js/components/DeniedAttemptsFeed.js` | O operador espera o próximo poll sem saber que há um; o Journal já tem o padrão a copiar |
| 7 | Sistema recém-instalado mostra "Cadastrados 0" sem próxima ação | `js/components/Dashboard.js` | Quem herdar (ver `docs/operacional/reconstruir-do-zero.md`) não sabe que o próximo passo é importar pelo Réglages |
| 8 | Atalho de sair do kiosk (`Ctrl+Shift+Alt+Q`) não é descobrível | tela de bloqueio | Se é por design (anti-curioso), registrar a decisão; se não, uma dica na tela resolve |
| 9 | Badges "N pessoas" dos cards do Dashboard derivam da lista do último setor visitado | `js/components/Dashboard.js` (`activeCounts`) | Número errado ou zero na tela inicial; o conserto certo é expor `currentOccupancyByPoint`, que é PG-only (`@Disabled` no H2) e amplia a conferência manual 6-bis — **decisão, não tarefa** |
| 10 | Painel por operador ("Espace de gestion") | — | Plano completo em `docs/architecture/plano-espace-gestion.md` |

Itens **não** listados por já terem dono: contadores presos em teto (corrigidos
em 12/08), gráficos sem relevo (corrigidos), Durée moyenne (corrigida — queda
deliberada, ver smoke checklist §4.1), D-H3 "Barrados"=="Alertas" (ACEITO pelo
Sam em 20/07, não é dívida).
