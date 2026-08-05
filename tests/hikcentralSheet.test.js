import { describe, it, expect } from 'vitest';
import sheet from '../js/utils/hikcentralSheet.js';

/**
 * LEITURA DO EXPORT DO HIKCENTRAL.
 *
 * Arquivo real: "Renseignements personnels", 1198 linhas, cabeçalho na LINHA 9
 * (as 8 primeiras são instruções do próprio HCP), coluna Service no formato
 * "All Departments/<DEPT>".
 *
 * É a única parte do import que roda no cliente — e a que erra em SILÊNCIO se
 * o HikCentral mudar o arquivo: colunas trocadas de lugar, acento diferente, ou
 * a matrícula lida como número. Nenhuma dessas falhas dá erro; elas só fazem o
 * import não casar com ninguém.
 */
describe('hikcentralSheet', () => {

    describe('cabeçalho na linha 9', () => {
        it('manda o xlsx começar a ler no índice 8 (= linha 9)', () => {
            expect(sheet.HEADER_ROW_INDEX).toBe(8);
            expect(sheet.sheetOptions().range).toBe(8);
        });

        it('lê tudo como TEXTO — raw:false', () => {
            // Sem isto o xlsx converte 0004486 em 4486 e a matrícula deixa de
            // casar com app_users.id.
            expect(sheet.sheetOptions().raw).toBe(false);
        });

        it('a primeira linha de dados é a 10 da planilha', () => {
            const linhas = sheet.mapRows([{ ID: '0004486' }, { ID: '5000000001' }]);
            expect(linhas[0].linha).toBe(10);
            expect(linhas[1].linha).toBe(11);
        });
    });

    describe('colunas casadas pelo NOME, insensível a acento e caixa', () => {
        const esperado = { id: '0004486', prenom: 'Maria', nom: 'SOUZA', service: 'All Departments/ALUNOS' };

        it('aceita a grafia do arquivo real (Prénom, Nom de famille)', () => {
            const [r] = sheet.mapRows([{
                'ID': '0004486', 'Prénom': 'Maria', 'Nom de famille': 'SOUZA',
                'Service': 'All Departments/ALUNOS',
            }]);
            expect(r).toMatchObject(esperado);
        });

        it('aceita sem acento', () => {
            const [r] = sheet.mapRows([{
                'ID': '0004486', 'Prenom': 'Maria', 'Nom de famille': 'SOUZA',
                'Service': 'All Departments/ALUNOS',
            }]);
            expect(r).toMatchObject(esperado);
        });

        it('aceita em caixa alta e com espaço sobrando', () => {
            const [r] = sheet.mapRows([{
                ' ID ': '0004486', 'PRÉNOM': 'Maria', 'NOM DE FAMILLE': 'SOUZA',
                'SERVICE': 'All Departments/ALUNOS',
            }]);
            expect(r).toMatchObject(esperado);
        });

        it('★ casa pelo nome e NÃO pela posição — coluna nova no meio não quebra', () => {
            // O HCP acrescenta e reordena coluna entre versões; posição fixa
            // quebraria em silêncio.
            const [r] = sheet.mapRows([{
                'Coluna Nova': 'lixo', 'Service': 'All Departments/ADM',
                'Nom de famille': 'DUPONT', 'ID': '5000000001', 'Outra': 'x', 'Prénom': 'Marie',
            }]);
            expect(r).toMatchObject({ id: '5000000001', prenom: 'Marie', nom: 'DUPONT', service: 'All Departments/ADM' });
        });
    });

    describe('zeros à esquerda', () => {
        it('★ preserva a matrícula 0004486 como texto', () => {
            const [r] = sheet.mapRows([{ ID: '0004486', 'Prénom': 'M', 'Nom de famille': 'S' }]);
            expect(r.id).toBe('0004486');
            expect(r.id).not.toBe('4486');
        });

        it('preserva um id interno de 10 dígitos', () => {
            const [r] = sheet.mapRows([{ ID: '5629236986', 'Prénom': 'Tatiana', 'Nom de famille': 'PÁEZ' }]);
            expect(r.id).toBe('5629236986');
        });
    });

    describe('linhas descartadas na leitura', () => {
        it('linha sem ID é rodapé do export, não registro', () => {
            const linhas = sheet.mapRows([
                { ID: '0004486', 'Prénom': 'M', 'Nom de famille': 'S' },
                { ID: '', 'Prénom': '', 'Nom de famille': '' },
                { ID: '5000000001', 'Prénom': 'J', 'Nom de famille': 'M' },
            ]);
            expect(linhas).toHaveLength(2);
        });

        it('★ a numeração da planilha continua certa depois de uma linha descartada', () => {
            // O relatório aponta "L457"; se o número deslizar, o operador
            // procura a linha errada no arquivo.
            const linhas = sheet.mapRows([
                { ID: '0004486' },   // linha 10
                { ID: '' },          // linha 11, descartada
                { ID: '5000000001' } // linha 12
            ]);
            expect(linhas.map(r => r.linha)).toEqual([10, 12]);
        });

        it('a linha de teste do aparelho (ID=1) passa na leitura — quem recusa é o backend', () => {
            // Separação de responsabilidade: o cliente lê, o servidor decide.
            const linhas = sheet.mapRows([{ ID: '1', 'Prénom': 'Andre', 'Nom de famille': '', 'Service': '' }]);
            expect(linhas).toHaveLength(1);
            expect(linhas[0].id).toBe('1');
        });
    });

    describe('valores ausentes', () => {
        it('campo vazio vira string vazia, nunca undefined', () => {
            const [r] = sheet.mapRows([{ ID: '5000000001' }]);
            expect(r).toMatchObject({ prenom: '', nom: '', service: '' });
        });

        it('planilha vazia devolve lista vazia', () => {
            expect(sheet.mapRows([])).toEqual([]);
            expect(sheet.mapRows(null)).toEqual([]);
        });
    });

    describe('chave() — normalização de cabeçalho', () => {
        it('reduz acento, caixa e pontuação à mesma chave', () => {
            expect(sheet.chave('Prénom')).toBe('prenom');
            expect(sheet.chave('PRÉNOM ')).toBe('prenom');
            expect(sheet.chave('Nom de famille')).toBe('nomdefamille');
            expect(sheet.chave('')).toBe('');
            expect(sheet.chave(null)).toBe('');
        });
    });
});
