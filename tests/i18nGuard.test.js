import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * O GUARDA DA MIGRAÇÃO: tela migrada não volta a ter texto cru.
 *
 * O app tem de estar INTEIRO em francês ou INTEIRO em português. O jeito de
 * isso se desfazer não é alguém decidir desfazer — é alguém acrescentar um
 * botão com o rótulo escrito à mão, seis meses depois, num arquivo que já
 * estava migrado. Ninguém nota: a tela funciona, e só quem opera no outro
 * idioma vê a palavra solta.
 *
 * Este teste lê o AST (o mesmo Babel vendorizado que o app usa em runtime) e
 * reprova texto visível fora do i18n nos arquivos da lista MIGRADAS. Regex não
 * serviria: `className="flex items-end"` e `{t('x')}` são strings em JSX como
 * qualquer outra, e distinguir sem árvore sintática é adivinhação.
 *
 * ⚠️ COMO ESTE ARQUIVO CRESCE: cada tela migrada entra em MIGRADAS na MESMA
 * entrega em que é migrada. Uma tela fora da lista não é protegida — e é por
 * isso que a lista é a medida honesta do progresso.
 */

const REPO = path.resolve(__dirname, '..');
const require2 = createRequire(import.meta.url);
const Babel = require2(path.join(REPO, 'libs', 'babel-standalone-8.0.4.min.js'));

/** Telas JÁ migradas — protegidas a partir de agora. */
const MIGRADAS = [
    'js/components/LoginScreen.js',
    'js/components/Header.js',
    'js/components/LanguageSelector.js',
    // Caminho DIÁRIO do operador — o que ele vê em toda passagem.
    'js/components/Dashboard.js',
    'js/components/AdminPinModal.js',
    'js/components/ConnectionStatus.js',
    'js/components/ActiveTimers.js',
    'js/components/Toast.js',
    // Leva 1 — OPERAÇÃO (ordem acordada: operação → gestão → relatórios →
    // AppSettingsModal por último e sozinho).
    'js/components/PasswordInput.js',
    'js/components/ListaLimitada.js',
    'js/components/DeniedAttemptsFeed.js',
    'js/cdi/LockScreen.js',
    'js/cdi/HistoryModal.js',
    'js/components/SectorView.js',
    'js/components/FinDeJournee.js',
    'js/components/AccessModals.js',
    'js/components/CantineMonitor.js',
    'js/cdi/StudentManagerModal.js',
    'js/cdi/HelpModal.js',
    // Leva 2 — GESTÃO.
    'js/components/MealEntitlementManagement.js',
    'js/components/MealEntitlementHistoryModal.js',
    'js/components/ExitPermissionManagement.js',
    'js/components/UserManagement.js',
    'js/components/UserListPanel.js',
    // Leva 3 — RAPPORTS.
    'js/cdi/StatsModal.js',
    'js/components/RefectoryReport.js',
    'js/components/InfirmaryReport.js',
    'js/components/GeneralReport.js',
    'js/cdi/BibliotecaView.js',
    'js/cdi/SettingsModal.js',
    'js/components/ImportColumnList.js',
    'js/App.js',
    // Leva final.
    'js/components/AdminDashboard.js',
    'js/components/AppSettingsModal.js',
    'js/components/StudentRegimeManagement.js',
    'js/components/RegimeVerdictBadge.js',
    'js/components/PpmsView.js',
];

/** Atributos cujo valor o usuário LÊ. `className`, `type`, `name` não entram. */
const ATRIBUTOS_VISIVEIS = new Set(['title', 'placeholder', 'aria-label', 'alt']);

/**
 * O que pode continuar cru, e por quê.
 *
 * ⚠️ Cada entrada é uma DECISÃO, não uma conveniência: nome próprio e
 * vocabulário de domínio não se traduzem, e traduzi-los quebraria o casamento
 * com o aparelho, com a planilha ou com o cadastro.
 */
const NAO_SE_TRADUZ = [
    /^MAGBO/,                      // marca
    /^Lycée Molière$/,             // nome da escola, em francês nos dois idiomas
    /^Magbo Studio$/,              // marca (rodapé do CDI), grafia própria
    /^HikCentral$/,                // produto Hikvision — nome próprio
    /^Renseignements personnels$/, // nome do export do HCP, francês no produto
    /^Apply to Device$/,           // item de menu do HCP, inglês no produto
    /^ID Hikvision$/,              // rótulo técnico, idêntico nos dois idiomas
    /^\.(xlsx|xls|csv|json|zip)$/, // extensão de arquivo
    /^[A-Z][A-Z0-9_]{2,}$/,        // PORT1, REFEI1, POSTO_FIXO, FECHAMENTO_AUTO…
    /^(FUNC|PROF)-/,               // matrículas de servidor
    /^[\d\s.,:/·%+()-]*$/,         // pontuação, números, separadores
    /^[·:/|—–-]$/,
    // Combinação de teclas: 'Alt + L', 'Ctrl + S' — o que está escrito na
    // tecla física, igual nos dois idiomas.
    /^(Alt|Ctrl|Shift|Cmd|Tab|F\d+)( ?\+ ?\w+)*$/,
    /^[\w.+-]+@[\w.-]+\.\w+$/,   // e-mail de contato
    /^v\d+\.\d+/,                 // versão
    /^[A-Z]\d$/,                  // turma (A1, B2) — dado, não texto
    /^[A-Z]$/,                     // letra solta (o L de L{linha})
    /^(min|m|h|s)$/,               // unidades de tempo — iguais nos dois idiomas
    // A mesma unidade colada à pontuação da frase que a rodeia: " min)", "h : ".
    // O texto traduzível já saiu para uma chave; o que sobra no template literal
    // é a unidade e o parêntese.
    /^[\s(]*(min|m|h|s)[\s):.,·-]*$/,
    // CSS dentro de <style>{`…`}</style>: é folha de estilo, não frase. As três
    // telas com impressão (StatsModal, Refectory, Infirmary) trazem um bloco
    // @media print inteiro num template literal.
    /^@media|[{;]\s*$|^\s*[.#]?[\w-]+\s*\{/,
    // A linha de exemplos de status aceita TODOS os idiomas de uma vez — ela
    // ensina o que a planilha pode conter, e a planilha não tem idioma.
    /^Autorizado · Não autorizado · Autorisé · Non autorisé/,
];

function podeFicarCru(texto) {
    const s = texto.trim();
    if (s === '') return true;
    // Uma palavra sem letra nenhuma não é texto de interface.
    if (!/[A-Za-zÀ-ÿ]/.test(s)) return true;
    return NAO_SE_TRADUZ.some(re => re.test(s));
}

/**
 * Props de COMPONENTE que o usuário lê. `title` e `placeholder` já valem como
 * atributo do DOM; estes são os equivalentes dos componentes próprios do
 * projeto (ListaLimitada, DeniedAttemptsFeed…), que o navegador não conhece
 * mas que acabam na tela do mesmo jeito.
 */
const PROPS_VISIVEIS = new Set([
    ...ATRIBUTOS_VISIVEIS, 'titulo', 'label', 'rotulo', 'texto', 'message',
    'emptyMessage', 'mensagem', 'subtitulo', 'descricao',
]);

/** A chamada é t(...) ou tEnum(...)? Então o que está dentro é CHAVE, não texto. */
function ehChamadaDeTraducao(no) {
    if (!no || no.type !== 'CallExpression') return false;
    const c = no.callee;
    if (c?.type === 'Identifier') return c.name === 't' || c.name === 'tEnum';
    if (c?.type === 'MemberExpression') {
        return c.property?.type === 'Identifier'
            && (c.property.name === 't' || c.property.name === 'tEnum');
    }
    return false;
}

/**
 * Texto visível fora do i18n, com a linha — o AST é a única leitura confiável.
 *
 * ⚠️ TRÊS CLASSES, e a terceira foi acrescentada em 14/08/2026 depois de uma
 * regressão real: `{importando ? 'GRAVANDO...' : plano.rotuloConfirmar}` e
 * ``titulo={`${n} linha(s) ignorada(s)`}`` viviam numa tela que estava na lista
 * MIGRADAS, e o guarda passava verde porque só olhava JSXText e atributo com
 * aspas. Literal DENTRO de expressão JSX era o ponto cego declarado — e o que
 * é declarado e não testado volta.
 *
 *   1. JSXText            — texto solto entre tags
 *   2. JSXAttribute       — title="..." e irmãos, com aspas
 *   3. expressão JSX      — {'...'} e {`...`}, em filho ou em prop visível,
 *                           exceto quando é argumento de t()/tEnum() (aí é chave)
 */
function textosCrus(codigo, arquivo) {
    const { ast } = Babel.transform(codigo, {
        parserOpts: { plugins: ['jsx'] },
        ast: true, code: false, filename: arquivo,
    });

    const achados = [];

    /**
     * Varre uma expressão JSX atrás de literal humano fora do i18n.
     *
     * ⚠️ Percorre só POSIÇÕES DE VALOR — ternário, `&&`, concatenação, o próprio
     * literal — e PARA em chamada de função, objeto e JSX aninhado. A varredura
     * profunda foi tentada primeiro e afogou o teste: `className={x ? 'bg-red' :
     * 'bg-green'}`, `style={{color:'#0C1B3A'}}` e `React.createElement('button')`
     * são todos literais dentro de expressão, e nenhum deles chega aos olhos de
     * ninguém como texto. Um guarda que acusa trezentas linhas certas para pegar
     * duas erradas é desligado na primeira semana.
     */
    function dentroDaExpressao(no, ondeLinha) {
        if (!no || typeof no !== 'object') return;
        const linha = no.loc?.start?.line ?? ondeLinha;

        switch (no.type) {
            case 'StringLiteral':
                if (!podeFicarCru(no.value)) {
                    achados.push(`linha ${linha}: literal em expressão JSX "${no.value.slice(0, 60)}"`);
                }
                return;
            case 'TemplateLiteral':
                for (const q of no.quasis || []) {
                    const cru = q.value?.cooked ?? q.value?.raw ?? '';
                    if (!podeFicarCru(cru)) {
                        achados.push(`linha ${linha}: template literal em JSX "${cru.trim().slice(0, 60)}"`);
                    }
                }
                // As interpolações podem carregar outro ternário com texto.
                (no.expressions || []).forEach(e => dentroDaExpressao(e, linha));
                return;
            case 'ConditionalExpression':
                dentroDaExpressao(no.consequent, linha);
                dentroDaExpressao(no.alternate, linha);
                return;
            case 'LogicalExpression':
                dentroDaExpressao(no.left, linha);
                dentroDaExpressao(no.right, linha);
                return;
            case 'BinaryExpression':
                if (no.operator === '+') {
                    dentroDaExpressao(no.left, linha);
                    dentroDaExpressao(no.right, linha);
                }
                return;
            case 'ParenthesizedExpression':
                dentroDaExpressao(no.expression, linha);
                return;
            default:
                // Chamada, objeto, JSX aninhado, identificador: não é texto solto
                // nesta posição, ou é tratado pelo caminhante de fora.
                return;
        }
    }

    (function anda(no, paiAtributo) {
        if (!no || typeof no !== 'object') return;

        if (no.type === 'JSXText' && !podeFicarCru(no.value)) {
            achados.push(`linha ${no.loc?.start?.line}: texto JSX "${no.value.trim().slice(0, 60)}"`);
        }
        if (no.type === 'JSXAttribute'
            && no.value?.type === 'StringLiteral'
            && ATRIBUTOS_VISIVEIS.has(no.name?.name)
            && !podeFicarCru(no.value.value)) {
            achados.push(`linha ${no.loc?.start?.line}: ${no.name.name}="${no.value.value.slice(0, 60)}"`);
        }

        // Classe 3. Só em lugar que chega à TELA: filho de elemento JSX, ou
        // valor de prop visível. `className={cond ? 'bg-red' : 'bg-green'}`
        // continua de fora, que é o que evita afogar o teste em falso positivo.
        if (no.type === 'JSXExpressionContainer') {
            const ehFilho = paiAtributo == null;
            const ehPropVisivel = paiAtributo != null && PROPS_VISIVEIS.has(paiAtributo);
            if (ehFilho || ehPropVisivel) {
                dentroDaExpressao(no.expression, no.loc?.start?.line);
            }
        }

        for (const chave in no) {
            if (chave === 'loc' || chave === 'leadingComments' || chave === 'trailingComments') continue;
            const v = no[chave];
            const nomeAttr = (no.type === 'JSXAttribute' && chave === 'value') ? no.name?.name : null;
            if (Array.isArray(v)) v.forEach(x => anda(x, nomeAttr));
            else if (v && typeof v === 'object') anda(v, nomeAttr);
        }
    })(ast, null);

    return achados;
}

describe('guarda do i18n', () => {

    it('o cenário faz sentido (há telas migradas e o Babel do app carregou)', () => {
        expect(MIGRADAS.length).toBeGreaterThan(0);
        expect(typeof Babel.transform).toBe('function');
    });

    // Um teste POR ARQUIVO: quando quebrar, o arquivo culpado está no título
    // vermelho, e os outros continuam sendo verificados.
    for (const arquivo of MIGRADAS) {
        it(`★ ${arquivo} não tem texto visível fora do i18n`, () => {
            const codigo = fs.readFileSync(path.join(REPO, arquivo), 'utf8');
            expect(textosCrus(codigo, arquivo),
                `${arquivo}: use t('chave') e acrescente a entrada nos DOIS dicionários `
                + 'de js/utils/i18n.js. Se o texto REALMENTE não se traduz (código de ponto, '
                + 'flag, matrícula, marca), acrescente o padrão em NAO_SE_TRADUZ com a razão.')
                .toEqual([]);
        });
    }

    it('★ toda tela migrada passa pelo hook useI18n', () => {
        // Sem o hook, o texto até sai traduzido na primeira renderização — mas
        // a tela não re-renderiza na troca de idioma e fica na língua anterior.
        // É a mistura voltando por outra porta.
        const semHook = MIGRADAS.filter(f => {
            const c = fs.readFileSync(path.join(REPO, f), 'utf8');
            return !/useI18n\s*\(/.test(c);
        });
        expect(semHook).toEqual([]);
    });

    it('★ CADA componente de topo que chama t() tem o PRÓPRIO hook', () => {
        // Apanhado de verdade em 13/08: o UserFormModal (segundo componente do
        // UserManagement.js) recebeu t() nas strings mas não o hook — `t` do
        // componente vizinho não está no escopo dele, e isso é ReferenceError
        // em RUNTIME, não texto na língua errada. O teste por arquivo passava:
        // o arquivo tinha "useI18n" em outro componente.
        // Componentes ANINHADOS (const Card = ... dentro do pai) ficam no
        // chunk do pai e herdam o t dele pelo closure — corretamente aceitos.
        const quebrados = [];
        for (const f of MIGRADAS) {
            const c = fs.readFileSync(path.join(REPO, f), 'utf8');
            const chunks = c.split(/^(?=function )/m);
            for (const chunk of chunks) {
                const nome = chunk.match(/^function (\w+)/)?.[1];
                if (!nome) continue;
                const chamaT = /[^\w.]t\s*\(\s*['"`]/.test(chunk);
                const temHook = /useI18n\s*\(/.test(chunk) || /\bt\b/.test(chunk.match(/^function \w+\(([^)]*)\)/)?.[1] || '');
                if (chamaT && !temHook) quebrados.push(`${f} → ${nome}`);
            }
        }
        expect(quebrados,
            'componente usa t() sem o próprio useI18n() — ReferenceError em runtime')
            .toEqual([]);
    });

    it('★ o guarda PEGA um texto cru (prova de que ele morde)', () => {
        // Um guarda que nunca reprovou nada não prova nada.
        const ruim = 'function X(){ return <button title="Salvar">Enviar agora</button>; }';
        const achados = textosCrus(ruim, 'teste.js');
        expect(achados).toHaveLength(2);
        expect(achados.join(' ')).toMatch(/Enviar agora/);
        expect(achados.join(' ')).toMatch(/Salvar/);
    });

    it('★ o guarda NÃO reprova vocabulário de domínio nem chamadas de t()', () => {
        const bom = `function X(){ const t = useI18n();
            return <div className="flex gap-2" title={t('a.b')}>
              <span>{t('c.d')}</span><code>PORT1</code><code>POSTO_FIXO</code>
              <span>FUNC-036</span><span>·</span><b>Lycée Molière</b>
            </div>; }`;
        expect(textosCrus(bom, 'teste.js')).toEqual([]);
    });

    it('os dois dicionários têm exatamente as mesmas chaves', () => {
        // Chave só em pt seria texto que nunca aparece; só em fr, texto que o
        // português mostra em francês. A referência é fr (idioma padrão).
        const i18n = require2(path.join(REPO, 'js', 'utils', 'i18n.js'));
        const fr = Object.keys(i18n.DICIONARIOS.fr).sort();
        const pt = Object.keys(i18n.DICIONARIOS.pt).sort();
        expect(pt).toEqual(fr);
    });
});
