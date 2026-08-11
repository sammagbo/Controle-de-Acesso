import { describe, it, expect } from 'vitest';
import C from '../js/utils/importColumns.js';
import MealSheet from '../js/utils/mealSheet.js';

/**
 * AS COLUNAS DAS TELAS DE IMPORTAÇÃO.
 *
 * As telas listavam tudo com o mesmo peso ("ID, Nome, Tipo, Turma,
 * ResponsavelId, Parentesco, Telefone, Foto") e quem monta a planilha só
 * descobria o que era obrigatório pelo erro, com o arquivo já pronto.
 *
 * ⚠️ ISTO É DOCUMENTAÇÃO, NÃO VALIDAÇÃO — e é justamente por isso que precisa
 * de teste: documentação que diverge do código é pior que documentação
 * nenhuma, porque alguém confia nela. Cada conjunto abaixo foi lido da regra
 * real, e o campo `regra` diz onde ela mora.
 */
describe('colunas das importações', () => {

    const TELAS = ['ALUNOS', 'SERVIDORES', 'HIKCENTRAL', 'CSV_CDI', 'FOTOS'];

    describe('★ o que é obrigatório, por tela', () => {

        it('★ cadastro por Excel: ID e Nome (Turma é CONDICIONAL)', () => {
            // backend UserController.createUsersBulk: "ID obrigatório",
            // "Nome obrigatório", e "Turma obrigatória para ALUNO".
            expect(C.obrigatorias(C.ALUNOS)).toEqual(['ID', 'Nome']);

            const turma = C.ALUNOS.colunas.find(c => c.campo === 'Turma');
            expect(C.ehObrigatorio(turma)).toBe(false);
            expect(C.ehCondicional(turma)).toBe(true);
            expect(turma.nota).toMatch(/ALUNO/);
        });

        it('★ servidores: só o nome', () => {
            expect(C.obrigatorias(C.SERVIDORES)).toEqual(['nome']);
        });

        it('★ HikCentral: ID sozinho, e o nome EM CONJUNTO', () => {
            // HikCentralImportService.planejarLinha pula "Linha sem ID" e
            // "Linha sem nome"; montarNome aceita só um dos dois campos.
            expect(C.obrigatorias(C.HIKCENTRAL)).toEqual(['ID']);
            for (const campo of ['Prénom', 'Nom de famille']) {
                expect(C.ehCondicional(C.HIKCENTRAL.colunas.find(c => c.campo === campo)))
                    .toBe(true);
            }
            expect(C.ehObrigatorio(C.HIKCENTRAL.colunas.find(c => c.campo === 'Service')))
                .toBe(false);
        });

        it('★ CSV do CDI: os três, e a leitura é POSICIONAL', () => {
            // js/cdi/SettingsModal.js: `p.length >= 3` — a linha com menos de
            // três campos é descartada em silêncio, e o cabeçalho não é lido.
            expect(C.obrigatorias(C.CSV_CDI)).toEqual(['ID', 'Nom', 'Classe']);
            expect(C.CSV_CDI.posicional).toBe(true);
        });

        it('fotos: nome de arquivo e formato', () => {
            expect(C.obrigatorias(C.FOTOS)).toHaveLength(2);
            expect(C.FOTOS.colunas[0].nota).toMatch(/zeros à esquerda/);
        });
    });

    describe('★ direitos de refeição NÃO duplica a lista', () => {

        it('★ vem de mealSheet.documentacaoDeColunas, não de uma cópia', () => {
            // Duplicar criaria duas verdades sobre a mesma planilha.
            const doc = C.refeicoes(MealSheet);
            expect(doc.colunas.map(c => c.campo))
                .toEqual(MealSheet.documentacaoDeColunas().map(c => c.campo));
            expect(C.obrigatorias(doc)).toEqual(['Matrícula', 'Status']);
        });

        it('sem a fonte disponível, devolve null em vez de inventar', () => {
            expect(C.refeicoes({})).toBeNull();
        });
    });

    describe('forma dos dados — o que a tela precisa poder renderizar', () => {

        it('★ toda tela tem pelo menos uma coluna obrigatória', () => {
            // Uma tela sem nenhuma obrigatória é sinal de documentação
            // incompleta, não de importação sem exigências.
            for (const t of TELAS) {
                expect(C.obrigatorias(C[t]), t).not.toHaveLength(0);
            }
        });

        it('★ toda tela diz ONDE mora a regra de verdade', () => {
            // Sem isto, a próxima pessoa não tem como conferir se a
            // documentação envelheceu.
            for (const t of TELAS) {
                expect(C[t].regra, t).toBeTruthy();
            }
        });

        it('nenhum campo duplicado, nenhum campo vazio', () => {
            for (const t of TELAS) {
                const campos = C[t].colunas.map(c => c.campo);
                expect(new Set(campos).size, t).toBe(campos.length);
                for (const c of campos) expect(c, t).toBeTruthy();
            }
        });

        it('obrigatorio só assume os quatro valores previstos', () => {
            const validos = [true, false, 'condicional', 'conjunto'];
            for (const t of TELAS) {
                for (const c of C[t].colunas) {
                    expect(validos, `${t}.${c.campo}`).toContain(c.obrigatorio);
                }
            }
        });

        it('ehObrigatorio e ehCondicional são disjuntos', () => {
            // A tela decide o peso da fonte por ehObrigatorio e a etiqueta por
            // ehCondicional; se um campo caísse nos dois, teria etiqueta dupla.
            for (const t of TELAS) {
                for (const c of C[t].colunas) {
                    expect(C.ehObrigatorio(c) && C.ehCondicional(c), `${t}.${c.campo}`).toBe(false);
                }
            }
        });

        it('entrada inválida não estoura', () => {
            expect(C.obrigatorias(null)).toEqual([]);
            expect(C.ehObrigatorio(null)).toBe(false);
            expect(C.ehCondicional(undefined)).toBe(false);
        });
    });
});
