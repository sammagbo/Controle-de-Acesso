import { describe, it, expect, beforeEach } from 'vitest';
import I from '../js/utils/i18n.js';

/**
 * FUNDAÇÃO DE i18n.
 *
 * O que se testa aqui é sobretudo o comportamento em FALHA, porque é ele que
 * decide se um dia de operação sobrevive a um dicionário incompleto:
 *
 *  • chave que ninguém traduziu tem de APARECER, não sumir. Um rótulo vazio
 *    numa tela de portaria deixa um botão sem dizer o que faz; "login.entrar"
 *    escrito na tela é feio e é óbvio — alguém reporta no mesmo dia.
 *  • localStorage indisponível não pode derrubar o app.
 */
describe('i18n — fundação', () => {

    /** localStorage de mentira, para o teste não depender do jsdom. */
    const store = () => {
        const m = new Map();
        return {
            getItem: (k) => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => m.set(k, String(v)),
            _map: m
        };
    };

    beforeEach(() => {
        I.setLang('fr', store());
    });

    describe('idiomas disponíveis', () => {
        it('FR e PT, nesta ordem (FR é a língua de trabalho)', () => {
            expect(I.languages().map(l => l.code)).toEqual(['fr', 'pt']);
        });

        it('cada um tem rótulo legível', () => {
            expect(I.languages().map(l => l.label)).toEqual(['Français', 'Português']);
        });

        it('o padrão é francês', () => {
            expect(I.PADRAO).toBe('fr');
        });
    });

    describe('★ tradução', () => {
        it('traduz no idioma corrente', () => {
            I.setLang('fr', store());
            expect(I.t('login.entrar')).toBe('ACCÉDER');
            I.setLang('pt', store());
            expect(I.t('login.entrar')).toBe('ENTRAR');
        });

        it('a tela inteira do login muda de língua', () => {
            I.setLang('pt', store());
            expect(I.t('login.titulo')).toBe('Bem-vindo');
            expect(I.t('login.usuario')).toBe('USUÁRIO');
            expect(I.t('login.senha')).toBe('SENHA');
        });

        it('★ chave inexistente DEVOLVE A CHAVE, nunca vazio', () => {
            expect(I.t('nao.existe.esta.chave')).toBe('nao.existe.esta.chave');
        });

        it('★ chave só no padrão cai no padrão em vez de sumir', () => {
            // Simula um dicionário PT incompleto sem mexer nos arquivos reais.
            I.DICIONARIOS.fr['teste.so.no.padrao'] = 'Valeur';
            I.setLang('pt', store());
            try {
                expect(I.t('teste.so.no.padrao')).toBe('Valeur');
            } finally {
                delete I.DICIONARIOS.fr['teste.so.no.padrao'];
            }
        });

        it('chave nula ou vazia não estoura', () => {
            expect(I.t(null)).toBe('');
            expect(I.t(undefined)).toBe('');
            expect(I.t('')).toBe('');
        });
    });

    describe('interpolação {param}', () => {
        beforeEach(() => {
            I.DICIONARIOS.fr['teste.ola'] = 'Bonjour {nome}, {n} messages';
            I.DICIONARIOS.pt['teste.ola'] = 'Olá {nome}, {n} mensagens';
        });

        it('substitui os parâmetros', () => {
            expect(I.t('teste.ola', { nome: 'Sam', n: 3 })).toBe('Bonjour Sam, 3 messages');
        });

        it('★ parâmetro que ninguém passou fica VISÍVEL, não vira vazio', () => {
            expect(I.t('teste.ola', { nome: 'Sam' })).toBe('Bonjour Sam, {n} messages');
        });

        it('sem params devolve o texto cru', () => {
            expect(I.t('teste.ola')).toBe('Bonjour {nome}, {n} messages');
        });

        it('zero e string vazia são valores legítimos', () => {
            expect(I.t('teste.ola', { nome: '', n: 0 })).toBe('Bonjour , 0 messages');
        });
    });

    describe('★ preferência da máquina', () => {
        it('setLang persiste no storage', () => {
            const s = store();
            I.setLang('pt', s);
            expect(s.getItem(I.CHAVE_STORAGE)).toBe('pt');
        });

        it('★ init lê o que estava gravado', () => {
            const s = store();
            s.setItem(I.CHAVE_STORAGE, 'pt');
            expect(I.init(s)).toBe('pt');
            expect(I.t('login.entrar')).toBe('ENTRAR');
        });

        it('máquina nova (storage vazio) começa em francês', () => {
            expect(I.init(store())).toBe('fr');
        });

        it('valor corrompido no storage vira o padrão em vez de quebrar', () => {
            const s = store();
            s.setItem(I.CHAVE_STORAGE, 'klingon');
            expect(I.init(s)).toBe('fr');
        });

        it('★ localStorage que lança não derruba o app', () => {
            const quebrado = {
                getItem: () => { throw new Error('acesso negado'); },
                setItem: () => { throw new Error('acesso negado'); }
            };
            expect(I.init(quebrado)).toBe('fr');
            expect(I.setLang('pt', quebrado)).toBe('pt');   // a sessão muda mesmo sem persistir
            expect(I.t('login.entrar')).toBe('ENTRAR');
        });
    });

    describe('normalização do código', () => {
        it('aceita maiúscula e espaço', () => {
            expect(I.normalizar('  PT ')).toBe('pt');
        });

        it('aceita a forma longa (pt-BR -> pt)', () => {
            expect(I.normalizar('pt-BR')).toBe('pt');
            expect(I.normalizar('fr-FR')).toBe('fr');
        });

        it('idioma desconhecido vira o padrão', () => {
            expect(I.normalizar('es')).toBe('fr');
            expect(I.normalizar(null)).toBe('fr');
            expect(I.normalizar(42)).toBe('fr');
        });
    });

    describe('★ integridade dos dicionários', () => {
        it('★ PT cobre TODA chave de FR — nenhuma tela fica meio traduzida', () => {
            const faltando = Object.keys(I.DICIONARIOS.fr)
                .filter(k => !Object.prototype.hasOwnProperty.call(I.DICIONARIOS.pt, k));
            expect(faltando).toEqual([]);
        });

        it('★ PT não tem chave órfã — seria erro de digitação', () => {
            const sobrando = Object.keys(I.DICIONARIOS.pt)
                .filter(k => !Object.prototype.hasOwnProperty.call(I.DICIONARIOS.fr, k));
            expect(sobrando).toEqual([]);
        });

        it('nenhum texto está vazio', () => {
            const vazias = [];
            ['fr', 'pt'].forEach(l => {
                Object.keys(I.DICIONARIOS[l]).forEach(k => {
                    if (String(I.DICIONARIOS[l][k]).trim() === '') vazias.push(l + ':' + k);
                });
            });
            expect(vazias).toEqual([]);
        });

        it('as duas línguas dizem coisas DIFERENTES onde deveriam', () => {
            // Blindagem contra copiar-colar o dicionário e esquecer de traduzir.
            expect(I.DICIONARIOS.pt['login.entrar']).not.toBe(I.DICIONARIOS.fr['login.entrar']);
            expect(I.DICIONARIOS.pt['login.titulo']).not.toBe(I.DICIONARIOS.fr['login.titulo']);
        });
    });
});
