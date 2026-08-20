import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * O QUE A TELA DIZ QUANDO O SERVIDOR RECUSA.
 *
 * O commit 49ac00c matou a mentira grande — «Session expirée» para um erro de
 * FORMATO DE DATA. Sobrou a metade silenciosa da mesma família: o front não lia
 * a razão que o servidor mandava, e punha genéricos por cima dela.
 *
 * ⚠️ O BACKEND FALA DOIS DIALETOS DE ERRO, e o `js/api.js` lia só um:
 *     {"error": "..."}                      Access · ExitPermission ·
 *                                           MealEntitlement · SystemUser · User
 *     {"status":"error","message":"..."}    Staff · Regime · Photo · Totvs
 * Era por isso que as telas de foto e de pessoal pareciam bem e o PORTÃO não —
 * o dialeto, não a tela.
 *
 * ⚠️ E OS GENÉRICOS ESTAVAM DENTRO DO `catch` do response.json(). Não há
 * @ControllerAdvice neste backend, então uma exceção não tratada cai no /error
 * do Spring, que devolve JSON VÁLIDO e sem `message`
 * (server.error.include-message=on_param). O json() tinha SUCESSO, o catch
 * nunca corria, e um 500 de verdade chegava ao operador como «erro de
 * comunicação» — ou seja, como problema de rede. Eram código morto em produção.
 */

const REPO = path.resolve(__dirname, '..');
/**
 * ⚠️ CRLF NORMALIZADO NA LEITURA, e nao e detalhe: o `core.autocrlf` do Git
 * reescreve estes arquivos com CRLF ao fazer checkout no Windows. Um teste que
 * casa texto contendo quebra de linha passa ANTES do commit e reprova DEPOIS
 * dele — foi exatamente o que aconteceu aqui em 20/08/2026, e a mensagem
 * («expected -1 to be greater than -1») nao aponta para line ending nenhum.
 * Normalizar na leitura tira a plataforma da equacao.
 */
const ler = (...p) =>
    fs.readFileSync(path.join(REPO, ...p), 'utf8').split(String.fromCharCode(13)).join('');

const API = ler('js', 'api.js');
const UTILS = ler('js', 'utils', 'api.js');
const PIN = ler('js', 'components', 'AdminPinModal.js');
const USERS = ler('js', 'components', 'UserManagement.js');
const I18N = ler('js', 'utils', 'i18n.js');

describe('Só 401 é sessão — a regra que 49ac00c estabeleceu', () => {

    it('★ as DUAS camadas HTTP deslogam por 401, e por 403 só SEM token', () => {
        // A distinção é o TOKEN, não o número: pela dívida conhecida deste
        // projeto, um @PreAuthorize sem token responde 403 e não 401.
        for (const [nome, src] of [['js/api.js', API], ['js/utils/api.js', UTILS]]) {
            expect(src, nome).toMatch(/status === 401[\s\S]{0,120}logout/);
            expect(src, nome).toMatch(/status === 403 && !window\.auth\?\.getToken/);
        }
    });

    it('★ ninguém mais desloga por 403 com token na mão', () => {
        // Um `=== 403` seguido de logout SEM a guarda do token é a volta do
        // defeito. O PpmsView é a exceção documentada: ele trata 403 como
        // "sem permissão" e NÃO desloga — por isso não aparece aqui.
        const suspeitos = [];
        const dir = path.join(REPO, 'js');
        const andar = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) { andar(p); continue; }
                if (!e.name.endsWith('.js')) continue;
                const src = fs.readFileSync(p, 'utf8');
                for (const m of src.matchAll(/403[\s\S]{0,160}?logout\(/g)) {
                    const trecho = m[0];
                    if (!/getToken/.test(trecho)) {
                        suspeitos.push(path.relative(REPO, p).replace(/\\/g, '/'));
                    }
                }
            }
        };
        andar(dir);
        expect([...new Set(suspeitos)]).toEqual([]);
    });
});

describe('A razão do servidor chega à tela', () => {

    it('★ js/api.js lê os DOIS dialetos de erro', () => {
        expect(API).toMatch(/data\.message \|\| data\.error/);
    });

    it('★ os genéricos ficam FORA do catch — senão um 500 vira "erro de rede"', () => {
        // A ordem no arquivo é a prova: o bloco `if (!errorMsg)` tem de vir
        // DEPOIS do fecho do catch, não dentro dele.
        const iCatch = API.indexOf('} catch (e) {\n                // corpo não-JSON');
        const iGen = API.indexOf('if (!errorMsg) {');
        expect(iCatch).toBeGreaterThan(-1);
        expect(iGen).toBeGreaterThan(iCatch);
        expect(API).toMatch(/status === 403\) errorMsg = T\('api\.sem\.permissao\.acao'\)/);
        expect(API).toMatch(/status >= 500\) errorMsg = T\('api\.erro\.servidor'\)/);
    });

    it('★ registerAccess não devolve mais `null` — null não tem razão nenhuma', () => {
        // É o caminho de AÇÃO principal do app. Um 403 do AccessController diz
        // por extenso qual setor foi recusado; o operador via «erro de
        // comunicação» e ia chamar a informática em vez de pedir o direito.
        expect(UTILS).not.toMatch(/checkAuthError\(res\);\s*\n\s*if \(!res\.ok\) return null;\s*\n\s*const data = await res\.json\(\);\s*\n\s*return normaliseLog/);
        expect(UTILS).toMatch(/corpo\.error \|\| corpo\.message/);
    });

    it('★ a sentinela de refeição duplicada (409 → code DUPLICATE) sobreviveu', () => {
        // App.js:267 depende do `code`, não da mensagem — que agora muda de
        // idioma e por isso deixou de servir de sentinela.
        expect(UTILS).toMatch(/status === 409\) erro\.code = 'DUPLICATE'/);
        expect(API).toMatch(/status === 409\) erro\.code = 'DUPLICATE'/);
    });
});

describe('As telas que passavam ao lado das duas camadas', () => {

    it('★ o modal do PIN olha res.ok antes de acusar quem digitou', () => {
        // /admin/verify é hasRole('ADMIN'); um não-admin recebe 403. O corpo do
        // /error não tem `valid`, então `data.valid` era undefined e a tela
        // dizia «PIN incorrect. Tentative 1» — acusando de erro de digitação
        // uma recusa de PAPEL. Um 500 fazia o mesmo.
        expect(PIN).toMatch(/if \(!res\.ok\)/);
        expect(PIN).toMatch(/pin\.sem\.permissao/);
    });

    it('★ o modal do PIN não imprime mais o português do servidor', () => {
        // A guarda comparava a mensagem do servidor com o texto TRADUZIDO. O
        // backend manda «PIN incorreto»; em francês as strings diferiam, a
        // guarda deixava passar, e a tela francesa imprimia português. Em
        // português a guarda casava — foi assim que sobreviveu.
        expect(PIN).not.toMatch(/data\.message !== t\('pin\.erro'\)/);
        expect(PIN).toMatch(/incorreto\|incorrect/);
    });

    it('★ a lista de operadores nunca deixa de ser um array', () => {
        // `setUsers(await res.json())` sem checar res.ok: num 403/500 o corpo do
        // /error é um OBJETO, `users` deixava de ser array, e `users.map(...)`
        // estourava DENTRO da renderização — tela branca, não mensagem.
        expect(USERS).toMatch(/Array\.isArray\(lista\) \? lista : \[\]/);
        expect(USERS).toMatch(/if \(!res\.ok\)[\s\S]{0,200}setUsers\(\[\]\)/);
    });

    it('★ e ela DIZ o erro em vez de mostrar uma tabela vazia', () => {
        // Tabela vazia sem explicação é indistinguível de "não há operadores".
        expect(USERS).toMatch(/erroLista/);
    });
});

describe('As chaves novas existem nas duas línguas', () => {
    for (const k of ['api.sem.permissao.acao', 'api.erro.requisicao', 'pin.sem.permissao',
                     'comum.erro', 'comum.sucesso']) {
        it(`★ ${k}`, () => {
            expect(I18N.split(`'${k}':`).length - 1, `${k} deve estar em fr E em pt`).toBe(2);
        });
    }
});

describe('Droits Repas — a lista não desmonta a cada clique', () => {

    it('★ o spinner só substitui a tabela na PRIMEIRA carga', () => {
        // ⚠️ Esta era a causa VISÍVEL do salto: trocar uma tabela de 100 linhas
        // por uma caixa de ~100px encolhe o DOCUMENTO (não há container de
        // rolagem nesta tela) e o navegador prende a rolagem no topo. O
        // operador perdia o lugar a cada clique e procurava o aluno seguinte
        // outra vez.
        const M = ler('js', 'components', 'MealEntitlementManagement.js');
        expect(M).toMatch(/\{\(loading && mergedList\.length === 0\) \? \(/);
        expect(M).not.toMatch(/\{loading \? \(\s*\n\s*<div className="flex flex-col items-center justify-center py-12/);
    });

    it('★ e a CAUSA foi corrigida: o PUT devolve a linha', () => {
        // Sem corpo na resposta, a atualização em memória era código morto e
        // TODO clique recarregava a lista inteira. Medido em 20/08/2026: o PUT
        // devolvia 0 bytes; agora devolve o DTO.
        const C = ler('backend', 'src', 'main', 'java', 'com', 'magbo', 'access',
                      'controllers', 'MealEntitlementController.java');
        expect(C).toMatch(/return ResponseEntity\.ok\(mealEntitlementService\.getOrPending\(userId\)\);/);
    });
});
