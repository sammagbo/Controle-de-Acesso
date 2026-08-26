import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * "UM ESTRANHO CONSEGUE IMPLANTAR ISTO?"
 *
 * O revisor que chega em setembro tem o repositório e ninguém a quem perguntar.
 * O veredicto dele na primeira rodada foi que não conseguia pôr o sistema na VM:
 * migrações que não constavam de procedimento nenhum, e um CHECK que envelhece
 * em silêncio em relação ao enum Java.
 *
 * Estes dois testes tornam isso MECÂNICO, e nenhum deles precisa de banco:
 *
 *  1. Toda migração `Vxxx__*.sql` é NOMEADA no README. Uma migração que existe
 *     no diretório e não aparece no procedimento é uma migração que ninguém vai
 *     aplicar — e, no caso da V015, uma falha adiada que só arma semanas depois,
 *     em produção, dentro de uma transação que derruba um access_log real.
 *
 *  2. O CHECK de `access_attempts.denial_reason` cobre TODOS os valores do enum
 *     `DenialReason`. É a armadilha da V009, já paga duas vezes: o Hibernate
 *     gera o CHECK ao CRIAR a tabela e o `ddl-auto=update` nunca o altera, então
 *     um valor novo passa nos testes (H2 recria do zero) e explode só na VM.
 *
 * ⚠️ O que estes testes NÃO provam: que o SQL roda. Isso exige um Postgres, e
 * está na conferência manual do procedimento de deploy.
 */

const REPO = path.resolve(__dirname, '..');
const DIR = path.join(REPO, 'deploy', 'migrations');

const arquivos = fs.readdirSync(DIR)
    .filter(f => /^V\d+__.+\.sql$/.test(f))
    .sort();

describe('migrações — o procedimento existe e está completo', () => {

    it('o cenário faz sentido (há migrações e há README)', () => {
        expect(arquivos.length).toBeGreaterThan(10);
        expect(fs.existsSync(path.join(DIR, 'README.md'))).toBe(true);
    });

    it('★★ toda migração é NOMEADA no README — senão ninguém a aplica', () => {
        const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
        const ausentes = arquivos.filter(f => !readme.includes(f));

        expect(ausentes,
            `Estas migrações existem em deploy/migrations/ e não aparecem no README: `
            + `${ausentes.join(', ')}. Quem chega novo aplica o que o procedimento manda; `
            + 'o que está fora dele não é aplicado, e a falha aparece semanas depois, em produção.')
            .toEqual([]);
    });

    /**
     * Migrações históricas sem rollback, e a razão de cada uma.
     *
     * ⚠️ Lista fechada e nomeada, não uma exceção genérica: o que este teste
     * protege é que a PRÓXIMA migração não entre sem plano de volta. Apagar uma
     * entrada daqui é escrever o rollback, nunca afrouxar o teste.
     */
    const SEM_ROLLBACK_HISTORICO = {
        '006': 'só CREATE INDEX IF NOT EXISTS — desfazer é DROP INDEX e não há dado a perder',
        '008': 'coluna aditiva camera_person_id, preenchida sozinha pelas câmeras; R008 nunca foi escrito',
        '009': 'amplia CHECK; a V015 o reescreve por inteiro e R015 devolve esta mesma lista',
        '023': 'SEED de dados, nao de estrutura: as linhas que ele cria vivem nas tabelas '
             + 'da V021 e morrem com R021 (DROP). Um R023 que apagasse "so o que o seed pos" '
             + 'e impossivel de escrever honestamente — a partir do primeiro clique na tela '
             + 'de administracao, as linhas semeadas e as editadas pela Vie Scolaire sao '
             + 'indistinguiveis, e um rollback que levasse as duas destruiria trabalho humano '
             + 'para desfazer uma migracao.',
    };

    it('★★ toda migração NOVA tem rollback', () => {
        const rollbacks = fs.readdirSync(path.join(DIR, 'rollback'));
        const semRollback = arquivos
            .map(f => f.match(/^V(\d+)__/)[1])
            .filter(n => !rollbacks.some(r => r.startsWith(`R${n}__`)))
            .filter(n => !SEM_ROLLBACK_HISTORICO[n]);

        expect(semRollback,
            `Migrações sem arquivo de rollback: V${semRollback.join(', V')}. `
            + 'Uma migração sem plano de volta é uma migração que ninguém ousa aplicar '
            + 'numa sexta-feira. Escreva o R correspondente, ou registre a razão em '
            + 'SEM_ROLLBACK_HISTORICO — com a razão, não com o número.')
            .toEqual([]);
    });

    describe('★★ o CHECK de denial_reason acompanha o enum Java', () => {

        /** Valores declarados no enum, ignorando comentários. */
        function valoresDoEnum() {
            const src = fs.readFileSync(path.join(REPO,
                'backend/src/main/java/com/magbo/access/models/DenialReason.java'), 'utf8');
            const corpo = src
                .replace(/\/\*[\s\S]*?\*\//g, '')   // blocos de comentário
                .replace(/\/\/.*$/gm, '')           // linha
                .split('{')[1];
            return [...corpo.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*,?\s*$/gm)].map(m => m[1]);
        }

        /** A lista do CHECK mais recente sobre denial_reason. */
        function valoresDoCheck() {
            const sqls = arquivos
                .map(f => fs.readFileSync(path.join(DIR, f), 'utf8'))
                .filter(t => t.includes('denial_reason'));
            const ultimo = sqls[sqls.length - 1];
            const m = ultimo.match(/denial_reason\s+IN\s*\(([\s\S]*?)\)/i);
            if (!m) return null;
            return [...m[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]);
        }

        it('o cenário faz sentido (enum e CHECK foram encontrados)', () => {
            expect(valoresDoEnum().length).toBeGreaterThan(5);
            expect(valoresDoCheck()).not.toBeNull();
        });

        it('★★★ nenhum valor do enum fica de fora do CHECK', () => {
            const noEnum = valoresDoEnum();
            const noCheck = valoresDoCheck();
            const faltando = noEnum.filter(v => !noCheck.includes(v));

            expect(faltando,
                `Valores em DenialReason.java que o CHECK não aceita: ${faltando.join(', ')}. `
                + 'O Hibernate gera o CHECK ao CRIAR a tabela e o ddl-auto=update NUNCA o altera: '
                + 'nos testes o H2 recria do zero e fica verde, e o INSERT falha SÓ NA VM — dentro '
                + 'da transação, derrubando junto o access_log de uma passagem real. '
                + 'Acrescente o valor a uma migração (padrão da V009/V015).')
                .toEqual([]);
        });

        it('★ o CHECK não aceita valor que o enum não tem', () => {
            // O contrário também envelhece: um valor removido do Java e deixado
            // no CHECK sugere que ele ainda é gravável.
            const noEnum = valoresDoEnum();
            const sobrando = valoresDoCheck().filter(v => !noEnum.includes(v));
            expect(sobrando, `No CHECK e não no enum: ${sobrando.join(', ')}`).toEqual([]);
        });
    });

    /**
     * ★★★ A REGRA GERAL — e o defeito que ela teria apanhado no dia.
     *
     * O bloco acima cobre UMA coluna (denial_reason), porque foi ela que doeu
     * primeiro. A V014 mostrou que a regra é mais larga: ela criou
     * student_regimes e student_regime_events À MÃO, com seis colunas de enum
     * declaradas só como VARCHAR(32), e ninguém percebeu por três semanas.
     *
     * ⚠️ QUANDO UMA MIGRAÇÃO CRIA A TABELA, ELA PASSA A SER A AUTORA DO SCHEMA
     * NAQUELE AMBIENTE — e o Hibernate não corrige depois: `ddl-auto=update`
     * acrescenta coluna e tabela, nunca CHECK em tabela que já existe. O
     * resultado são DUAS VERDADES: uma VM atualizada pelo procedimento fica sem
     * o CHECK; uma VM nova (e o PC, e o H2 da suíte) nasce com ele, escrito pelo
     * Hibernate a partir do @Enumerated(STRING).
     *
     * ⚠️ E a falha é INVERTIDA em relação à do denial_reason. Lá o CHECK existia
     * e estava estreito: quebrava a VM e o PC ficava verde. Aqui o CHECK não
     * existe na VM: no dia em que alguém acrescentar um valor ao enum, quebra o
     * PC e a SUÍTE, e a VM aceita em silêncio — o valor novo entra na base de
     * produção sem nunca ter passado por uma verificação. "Falha na minha
     * máquina, funciona em produção" é o sintoma que ninguém procura.
     *
     * Este teste é a única coisa que faz a assimetria doer no minuto em que ela
     * nasce, em vez de em setembro, na mão de quem herdar o sistema.
     */
    describe('★★★ toda coluna de enum de tabela CRIADA por migração tem CHECK', () => {
        const MODELS = path.join(REPO, 'backend/src/main/java/com/magbo/access/models');

        const semComentarios = (txt) => txt
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');

        /** Tabelas que alguma migração CRIA (e não apenas altera). */
        function tabelasCriadasPorMigracao() {
            const nomes = new Set();
            for (const f of arquivos) {
                const txt = fs.readFileSync(path.join(DIR, f), 'utf8');
                for (const m of txt.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)) {
                    nomes.add(m[1].toLowerCase());
                }
            }
            return nomes;
        }

        /** [{ entidade, tabela, coluna, enumClasse }] de todo @Enumerated(STRING). */
        function colunasDeEnum() {
            const out = [];
            for (const nome of fs.readdirSync(MODELS).filter(f => f.endsWith('.java'))) {
                const src = semComentarios(fs.readFileSync(path.join(MODELS, nome), 'utf8'));
                const tab = src.match(/@Table\s*\(\s*name\s*=\s*"([a-z_]+)"/);
                if (!tab) continue;
                // @Enumerated(...STRING) · @Column(name="x") · private <Enum> campo;
                // Parser por LINHAS, não por regex de salto: a versão anterior
                // deixava o [\s\S]{0,400} passar POR CIMA da coluna do enum e
                // casar com a @Column seguinte — e então acusava
                // `access_attempts.terminal_ip (String)` de ser enum. Aqui, do
                // @Enumerated até o primeiro `private`, sem pular nada.
                const linhas = src.split('\n');
                for (let i = 0; i < linhas.length; i++) {
                    if (!/@Enumerated\s*\([^)]*STRING/.test(linhas[i])) continue;
                    let coluna = null, tipo = null;
                    for (let j = i + 1; j < Math.min(i + 8, linhas.length); j++) {
                        const c = linhas[j].match(/@Column\s*\(\s*name\s*=\s*"([a-z_]+)"/);
                        if (c) coluna = c[1];
                        const d = linhas[j].match(/private\s+([A-Z]\w*)\s+\w+\s*;/);
                        if (d) { tipo = d[1]; break; }
                    }
                    if (coluna && tipo) {
                        out.push({ entidade: nome.replace('.java', ''), tabela: tab[1], coluna, enumClasse: tipo });
                    }
                }
            }
            return out;
        }

        /** Valores de um enum Java, ignorando comentários. */
        function valoresDe(enumClasse) {
            const f = path.join(MODELS, enumClasse + '.java');
            if (!fs.existsSync(f)) return null;
            const corpo = semComentarios(fs.readFileSync(f, 'utf8')).split('{')[1];
            return [...corpo.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?:\([^)]*\))?\s*,?\s*$/gm)].map(m => m[1]);
        }

        /** Valores citados por algum CHECK de migração sobre aquela coluna. */
        function valoresNoCheck(coluna) {
            let achou = null;
            for (const f of arquivos) {
                const txt = fs.readFileSync(path.join(DIR, f), 'utf8');
                const re = new RegExp(coluna + "\\s+IN\\s*\\(([^)]*)\\)", 'i');
                const m = txt.match(re);
                if (m) achou = [...m[1].matchAll(/'([A-Z0-9_]+)'/g)].map(x => x[1]);
            }
            return achou;
        }

        it('o cenário faz sentido (há tabelas criadas por migração e colunas de enum)', () => {
            expect(tabelasCriadasPorMigracao().size).toBeGreaterThan(3);
            expect(colunasDeEnum().length).toBeGreaterThan(10);
        });

        it('★★★ nenhuma coluna de enum fica sem CHECK numa tabela que a migração cria', () => {
            const criadas = tabelasCriadasPorMigracao();
            const alvo = colunasDeEnum().filter(c => criadas.has(c.tabela));
            expect(alvo.length,
                'nenhuma coluna alvo encontrada — o parser quebrou, não é que esteja tudo certo')
                .toBeGreaterThan(5);

            const semCheck = alvo
                .filter(c => valoresNoCheck(c.coluna) === null)
                .map(c => `${c.tabela}.${c.coluna} (${c.enumClasse})`);

            expect(semCheck,
                `Colunas de enum sem CHECK em migração: ${semCheck.join(', ')}. `
                + 'A migração que CRIA a tabela é a autora do schema naquele ambiente, e o '
                + 'Hibernate não corrige depois (ddl-auto=update nunca altera CHECK existente). '
                + 'Sem o CHECK, uma VM atualizada e uma VM nova ficam com schemas DIFERENTES — e '
                + 'no dia em que o enum ganhar um valor, quebra o PC e a suíte enquanto a VM '
                + 'aceita em silêncio. Molde: V017.')
                .toEqual([]);
        });

        it('★★ e o CHECK lista EXATAMENTE os valores do enum', () => {
            const criadas = tabelasCriadasPorMigracao();
            const divergentes = [];
            for (const c of colunasDeEnum().filter(c => criadas.has(c.tabela))) {
                const noCheck = valoresNoCheck(c.coluna);
                const noEnum = valoresDe(c.enumClasse);
                if (!noCheck || !noEnum) continue;
                const faltando = noEnum.filter(v => !noCheck.includes(v));
                const sobrando = noCheck.filter(v => !noEnum.includes(v));
                if (faltando.length || sobrando.length) {
                    divergentes.push(`${c.tabela}.${c.coluna}: falta [${faltando}] sobra [${sobrando}]`);
                }
            }
            expect(divergentes, divergentes.join(' · ')).toEqual([]);
        });
    });
});
