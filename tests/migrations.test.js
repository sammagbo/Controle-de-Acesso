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
});
