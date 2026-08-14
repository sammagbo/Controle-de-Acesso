import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * O CONTRATO ENTRE O DTO E A TELA — porque não há normalizador entre os dois.
 *
 * A tela de Sorties lia `perm.type` e `perm.allowedDays`. O backend nunca mandou
 * esses nomes: o ExitPermissionDto tem `permissionType` e `daysOfWeek`. Como em
 * JavaScript um campo inexistente vale `undefined` e ninguém reclama, o defeito
 * era MUDO e tinha consequência de portaria:
 *
 *   • a coluna "Type" saía vazia em todas as linhas;
 *   • `perm.type === 'SINGLE'` era sempre falso, então TODA autorização caía no
 *     ramo recorrente e aparecia como "Toujours" — uma saída pontual, criada
 *     para um dia e um horário, lida no portão como permanente.
 *
 * Ninguém escreve um teste de "a tela mostra o tipo". O que dá para testar, e é
 * o que evita a repetição da classe inteira, é o CONTRATO: todo campo que a tela
 * lê de um objeto vindo do backend tem de existir no DTO que o backend envia.
 *
 * ⚠️ AST e não regex: depois do conserto, os nomes errados continuam no arquivo
 * — dentro do comentário que explica o defeito. Uma busca textual acusaria o
 * próprio comentário, e a correção seria apagar a explicação.
 */

const REPO = path.resolve(__dirname, '..');
const require2 = createRequire(import.meta.url);
const Babel = require2(path.join(REPO, 'libs', 'babel-standalone-8.0.4.min.js'));

/** Campos declarados num DTO Java (`private <Tipo> <nome>;`). */
function camposDoDto(arquivoJava) {
    const src = fs.readFileSync(path.join(REPO, arquivoJava), 'utf8');
    const campos = new Set();
    const re = /private\s+[\w<>,.\s\[\]]+?\s+(\w+)\s*;/g;
    let m;
    while ((m = re.exec(src)) !== null) campos.add(m[1]);
    return campos;
}

/** Propriedades lidas de uma variável, pelo AST — comentários não contam. */
function propriedadesLidas(arquivoJs, nomeDaVariavel) {
    const codigo = fs.readFileSync(path.join(REPO, arquivoJs), 'utf8');
    const { ast } = Babel.transform(codigo, {
        parserOpts: { plugins: ['jsx'] }, ast: true, code: false, filename: arquivoJs,
    });

    const lidas = new Set();
    (function anda(no) {
        if (!no || typeof no !== 'object') return;
        if (no.type === 'MemberExpression'
            && no.object?.type === 'Identifier'
            && no.object.name === nomeDaVariavel
            && !no.computed
            && no.property?.type === 'Identifier') {
            lidas.add(no.property.name);
        }
        for (const chave in no) {
            if (chave === 'loc' || chave === 'leadingComments' || chave === 'trailingComments') continue;
            const v = no[chave];
            if (Array.isArray(v)) v.forEach(anda);
            else if (v && typeof v === 'object') anda(v);
        }
    })(ast);
    return lidas;
}

describe('contrato ExitPermissionDto ↔ tela de Sorties', () => {

    const DTO = 'backend/src/main/java/com/magbo/access/dto/ExitPermissionDto.java';
    const TELA = 'js/components/ExitPermissionManagement.js';

    it('o cenário faz sentido (DTO e tela existem, e o DTO tem campos)', () => {
        expect(camposDoDto(DTO).size).toBeGreaterThan(5);
        expect(propriedadesLidas(TELA, 'perm').size).toBeGreaterThan(3);
    });

    it('★★ todo campo que a tela lê existe no DTO', () => {
        const declarados = camposDoDto(DTO);
        const lidos = [...propriedadesLidas(TELA, 'perm')];
        const inexistentes = lidos.filter(c => !declarados.has(c));

        expect(inexistentes,
            `A tela lê campos que o ExitPermissionDto não envia: ${inexistentes.join(', ')}. `
            + 'Em JS isso vale `undefined` e não levanta erro — o defeito aparece como coluna '
            + 'vazia ou como ramo errado de um ternário, no portão, sem nada acusando.')
            .toEqual([]);
    });

    it('★ os dois nomes que já causaram o defeito não voltam', () => {
        // Regressão nomeada: se alguém reintroduzir, o teste diz exatamente qual.
        const lidos = propriedadesLidas(TELA, 'perm');
        expect(lidos.has('type'), 'perm.type não existe — o campo é permissionType').toBe(false);
        expect(lidos.has('allowedDays'), 'perm.allowedDays não existe — o campo é daysOfWeek').toBe(false);
    });

    it('★ o tipo é lido, e é ele que decide o ramo pontual × recorrente', () => {
        const lidos = propriedadesLidas(TELA, 'perm');
        expect(lidos.has('permissionType')).toBe(true);
        expect(lidos.has('daysOfWeek')).toBe(true);
    });
});
