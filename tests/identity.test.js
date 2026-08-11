import { describe, it, expect } from 'vitest';
import I from '../js/utils/identity.js';

/**
 * COMO UMA PESSOA APARECE NA TELA.
 *
 * Relatado do uso real: o Rapport Général mostrava a matrícula crua onde
 * deveria estar o nome. A varredura achou o mesmo defeito no feed de negadas
 * da portaria, onde era pior — ali aparecia `CAM:SEM-IDENTIDADE` e
 * `CAM:HID:69205`, que são chaves internas de deduplicação e não apontam para
 * pessoa nenhuma.
 *
 * A regra que este arquivo cobra: o campo de NOME nunca contém um código.
 * Quando não há identidade, ele contém uma frase — dita como se diria em voz
 * alta na portaria. A matrícula é informação secundária e pode faltar; o nome
 * nunca falta.
 */
describe('identidade exibida', () => {

    const aluno = { id: '0003535', nome: 'Marie DUPONT', turma: '2nde A' };

    describe('★ o campo de nome NUNCA é um código', () => {

        it('★ pessoa do cadastro: nome, com matrícula como apoio', () => {
            const r = I.resolver({ pessoa: aluno, userId: '0003535' });
            expect(r.nome).toBe('Marie DUPONT');
            expect(r.matricula).toBe('0003535');
            expect(r.reconhecido).toBe(true);
            expect(r.estado).toBe('CADASTRADO');
        });

        it('★ rosto não reconhecido: FRASE, nunca CAM:SEM-IDENTIDADE', () => {
            const r = I.resolver({ employeeNoRaw: 'CAM:SEM-IDENTIDADE' });
            expect(r.nome).toBe('Pessoa não reconhecida');
            expect(r.matricula).toBeNull();
            expect(r.estado).toBe('SEM_IDENTIDADE');
        });

        it('★ chave sintética da câmera nunca vira matrícula', () => {
            // CAM:HID:<human_id> é chave de deduplicação: não existe em
            // app_users e não há cadastro para procurar com ela.
            const r = I.resolver({ employeeNoRaw: 'CAM:HID:69205' });
            expect(r.nome).toBe('Pessoa não reconhecida');
            expect(r.matricula).toBeNull();
        });

        it('★ em francês, a mesma frase', () => {
            expect(I.resolver({ employeeNoRaw: 'CAM:SEM-IDENTIDADE' }, { lang: 'fr' }).nome)
                .toBe('Personne non reconnue');
        });

        it('★ nenhum estado devolve nome vazio, nulo ou parecido com código', () => {
            const casos = [
                { pessoa: aluno, userId: '0003535' },
                { userId: '0003535' },
                { employeeNoRaw: 'CAM:SEM-IDENTIDADE' },
                { employeeNoRaw: 'FUNC-004' },
                { nome: 'Jean MARTIN', employeeNoRaw: 'CAM:HID:1' },
                {},
                null
            ];
            for (const c of casos) {
                for (const lang of ['pt', 'fr']) {
                    const r = I.resolver(c, { lang });
                    expect(r.nome, JSON.stringify(c)).toBeTruthy();
                    expect(r.nome.startsWith('CAM:')).toBe(false);
                    expect(/^\d+$/.test(r.nome)).toBe(false);
                }
            }
        });
    });

    describe('★ nome lido pela câmera sem cadastro correspondente', () => {

        it('★ mostra o nome lido, com etiqueta dizendo que não é do cadastro', () => {
            const r = I.resolver({ nome: 'Jean MARTIN', employeeNoRaw: '0009999' });
            expect(r.nome).toBe('Jean MARTIN');
            expect(r.matricula).toBe('0009999');
            expect(r.reconhecido).toBe(false);
            expect(r.etiqueta).toBe('Não cadastrado');
            expect(r.estado).toBe('LIDO_NAO_CADASTRADO');
        });

        it('★ o cadastro VENCE o nome lido pela câmera', () => {
            // A câmera lê um nome truncado ou transliterado; o cadastro é o
            // dado de referência. Ver PersonNameMatcher.
            const r = I.resolver({ pessoa: aluno, userId: '0003535', nome: 'Marie DUPON' });
            expect(r.nome).toBe('Marie DUPONT');
            expect(r.reconhecido).toBe(true);
        });

        it('★ "nome" que na verdade é a matrícula NÃO passa por nome', () => {
            // Defensivo: se um dia o nome_snapshot chegar com o próprio número,
            // aceitá-lo reintroduziria o defeito por outra porta.
            expect(I.resolver({ nome: '0003535', employeeNoRaw: '0003535' }).estado)
                .not.toBe('LIDO_NAO_CADASTRADO');
            expect(I.resolver({ nome: 'FUNC-004', employeeNoRaw: 'FUNC-004' }).nome)
                .not.toBe('FUNC-004');
            expect(I.resolver({ nome: 'CAM:HID:7' }).nome).toBe('Pessoa não reconhecida');
        });
    });

    describe('★ há matrícula mas o nome não está à mão', () => {

        it('★ palavra primeiro, número como apoio — nunca o número sozinho', () => {
            // O caso do Journal com o userCache ainda carregando.
            const r = I.resolver({ userId: '0003535' }, { lang: 'fr' });
            expect(r.nome).toBe('Nom indisponible');
            expect(r.matricula).toBe('0003535');
            expect(r.estado).toBe('NOME_INDISPONIVEL');
        });

        it('matrícula de servidor é preservada como está', () => {
            expect(I.resolver({ userId: 'FUNC-004' }).matricula).toBe('FUNC-004');
        });

        it('zeros à esquerda não são comidos', () => {
            expect(I.resolver({ userId: '0000123' }).matricula).toBe('0000123');
        });
    });

    describe('auxiliares', () => {

        it('ehChaveDeCamera reconhece só o prefixo CAM:', () => {
            expect(I.ehChaveDeCamera('CAM:SEM-IDENTIDADE')).toBe(true);
            expect(I.ehChaveDeCamera('CAM:HID:1')).toBe(true);
            expect(I.ehChaveDeCamera('0003535')).toBe(false);
            expect(I.ehChaveDeCamera('CAMILA SOUZA')).toBe(false);
            expect(I.ehChaveDeCamera(null)).toBe(false);
        });

        it('emUmaLinha junta nome e matrícula, e omite a matrícula ausente', () => {
            expect(I.emUmaLinha({ pessoa: aluno, userId: '0003535' }))
                .toBe('Marie DUPONT (0003535)');
            expect(I.emUmaLinha({ employeeNoRaw: 'CAM:SEM-IDENTIDADE' }))
                .toBe('Pessoa não reconhecida');
        });

        it('entrada nula ou vazia não estoura', () => {
            expect(I.resolver(null).estado).toBe('SEM_IDENTIDADE');
            expect(I.resolver({}).estado).toBe('SEM_IDENTIDADE');
            expect(I.resolver({ pessoa: { id: 'X', nome: '   ' } }).estado).not.toBe('CADASTRADO');
        });

        it('idioma desconhecido cai no português', () => {
            expect(I.resolver({}, { lang: 'de' }).nome).toBe('Pessoa não reconhecida');
        });
    });
});
