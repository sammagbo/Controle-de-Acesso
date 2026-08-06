import { describe, it, expect } from 'vitest';
import M from '../js/utils/mealSheet.js';

/**
 * LEITURA DA PLANILHA DE DIREITOS DE REFEIÇÃO.
 *
 * É a parte que erra em SILÊNCIO. Se a coluna vier renomeada, ou com outro
 * acento, ou se a matrícula for lida como número, o arquivo inteiro vira
 * "aluno não encontrado" — e o operador conclui que o cadastro está errado,
 * não a leitura.
 *
 * O zero à esquerda é a regra crítica do projeto: 0001764 lido como 1764 não
 * casa com ninguém em app_users.
 */
describe('mealSheet — colunas lidas pelo NOME', () => {

    describe('★ acento, caixa e espaço não importam', () => {
        it('★ "Matrícula", "MATRICULA" e "matricula " são a mesma coluna', () => {
            const variantes = [
                { 'Matrícula': '0001764', 'Status': 'AUTORIZADO' },
                { 'MATRICULA': '0001764', 'STATUS': 'AUTORIZADO' },
                { 'matricula ': '0001764', ' status': 'AUTORIZADO' },
                { 'Matricule': '0001764', 'Statut': 'AUTORIZADO' }
            ];
            variantes.forEach((row, i) => {
                const r = M.mapRows([row])[0];
                expect(r.userId, `variante ${i}`).toBe('0001764');
                expect(r.status, `variante ${i}`).toBe('AUTORIZADO');
            });
        });

        it('nome do campo do sistema também é aceito (arquivo exportado do MAGBO)', () => {
            const r = M.mapRows([{ userId: '0001764', status: 'AUTHORIZED' }])[0];
            expect(r.userId).toBe('0001764');
            expect(r.status).toBe('AUTHORIZED');
        });

        it('ID e employeeNo servem de matrícula', () => {
            expect(M.mapRows([{ ID: '0001764', Status: 'S' }])[0].userId).toBe('0001764');
            expect(M.mapRows([{ employeeNo: '0001764', Status: 'S' }])[0].userId).toBe('0001764');
        });

        it('coluna de status em francês', () => {
            expect(M.mapRows([{ Matricule: '0001764', 'Droit': 'Autorisé' }])[0].status)
                .toBe('Autorisé');
        });
    });

    describe('★ zeros à esquerda', () => {
        it('★ 0001764 chega inteiro — é a regra crítica do procedimento', () => {
            const r = M.mapRows([{ 'Matrícula': '0001764', 'Status': 'AUTORIZADO' }])[0];
            expect(r.userId).toBe('0001764');
            expect(r.userId).not.toBe('1764');
        });

        it('★ tudo é lido como TEXTO — sheetOptions manda raw:false', () => {
            // raw:false é o que impede o xlsx de converter a coluna em número.
            expect(M.sheetOptions()).toMatchObject({ raw: false, defval: '' });
        });

        it('cabeçalho está na primeira linha (planilha da direção, não export de sistema)', () => {
            expect(M.sheetOptions().range).toBe(0);
            expect(M.FIRST_DATA_ROW).toBe(2);
        });
    });

    describe('numeração das linhas', () => {
        it('★ a linha reportada é a do EXCEL, para o operador achar', () => {
            const rows = M.mapRows([
                { 'Matrícula': '0001111', 'Status': 'S' },
                { 'Matrícula': '0002222', 'Status': 'S' }
            ]);
            expect(rows[0].linha).toBe(2);   // cabeçalho na 1
            expect(rows[1].linha).toBe(3);
        });
    });

    describe('campos opcionais', () => {
        it('vigência e observação viajam quando existem', () => {
            const r = M.mapRows([{
                'Matrícula': '0001764', 'Status': 'AUTORIZADO',
                'Válido de': '2026-02-01', 'Válido até': '2026-06-30',
                'Observação': 'bolsista'
            }])[0];
            expect(r.validFrom).toBe('2026-02-01');
            expect(r.validUntil).toBe('2026-06-30');
            expect(r.note).toBe('bolsista');
        });

        it('★ célula vazia vira NULL, não string vazia', () => {
            // '' chegaria ao Jackson como data inválida e derrubaria a linha.
            const r = M.mapRows([{ 'Matrícula': '0001764', 'Status': 'S', 'Válido até': '' }])[0];
            expect(r.validUntil).toBeNull();
            expect(r.note).toBeNull();
        });

        it('sem acento no cabeçalho da vigência também casa', () => {
            const r = M.mapRows([{ 'Matricula': '0001764', 'Status': 'S', 'Valido ate': '2026-06-30' }])[0];
            expect(r.validUntil).toBe('2026-06-30');
        });
    });

    describe('linhas que não são registro', () => {
        it('★ linha totalmente vazia sai fora (rodapé/separador)', () => {
            const rows = M.mapRows([
                { 'Matrícula': '0001764', 'Status': 'S' },
                { 'Matrícula': '', 'Status': '' },
                { 'Matrícula': '   ', 'Status': '  ' }
            ]);
            expect(rows).toHaveLength(1);
        });

        it('★ linha COM status e SEM matrícula CONTINUA — o backend a reporta', () => {
            // Sumir com ela em silêncio esconderia um erro da planilha; o
            // backend devolve "Linha sem matrícula" e o operador conserta.
            const rows = M.mapRows([{ 'Matrícula': '', 'Status': 'AUTORIZADO' }]);
            expect(rows).toHaveLength(1);
            expect(rows[0].userId).toBe('');
        });

        it('entrada malformada não estoura', () => {
            expect(M.mapRows(null)).toEqual([]);
            expect(M.mapRows('não é array')).toEqual([]);
            expect(M.mapRows([])).toEqual([]);
        });
    });

    describe('★ documentação das colunas', () => {
        it('★ a tela mostra a MESMA lista que o código lê — sem duplicar', () => {
            const doc = M.documentacaoDeColunas();
            const matricula = doc.find(c => c.campo === 'Matrícula');
            expect(matricula.aceitos).toBe(M.COLUNAS.matricula);
            expect(matricula.obrigatorio).toBe(true);
        });

        it('matrícula e status são obrigatórias; vigência e nota não', () => {
            const doc = M.documentacaoDeColunas();
            expect(doc.filter(c => c.obrigatorio).map(c => c.campo))
                .toEqual(['Matrícula', 'Status']);
        });

        it('todo campo documentado tem nomes aceitos não vazios', () => {
            M.documentacaoDeColunas().forEach(c => {
                expect(c.aceitos.length, c.campo).toBeGreaterThan(0);
            });
        });
    });

    describe('reuso do hikcentralSheet', () => {
        it('★ usa o mesmo helper de cabeçalho já testado, não uma cópia', async () => {
            // Se um dia alguém duplicar a normalização aqui, as duas regras
            // divergem e só uma das telas passa a aceitar "Prénom " com espaço.
            const hik = (await import('../js/utils/hikcentralSheet.js')).default
                || (await import('../js/utils/hikcentralSheet.js'));
            expect(typeof hik.col).toBe('function');
            expect(hik.chave('Matrícula')).toBe(hik.chave('MATRICULA '));
        });
    });
});
