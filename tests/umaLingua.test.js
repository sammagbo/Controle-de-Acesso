import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A INTERFACE FALA UMA LÍNGUA SÓ.
 *
 * O dono abriu o painel principal em 20/08/2026 e viu, num mesmo cartão,
 * «Infirmerie» por cima de «Enfermaria». Havia SEIS legendas em português
 * na tela de abertura, e uma sétima palavra portuguesa piscava no rodapé
 * de TODA tela a cada reconexão.
 *
 * ⚠️ E A SUÍTE ESTAVA VERDE. `tests/i18nGuard.test.js` passava com 44
 * testes, e passava honestamente: ele anda por JSXText, JSXAttribute e
 * literais dentro de expressão JSX — três classes. Nenhum destes defeitos
 * é dessas três:
 *
 *   • ACCESS_POINTS vive em js/data/constants.js, um arquivo de DADOS que
 *     não está (nem deveria estar) na lista MIGRADAS de componentes JSX.
 *   • 'Reconectando...' é um literal atribuído a uma VARIÁVEL LOCAL e
 *     renderizado depois como {label} — uma quarta classe.
 *   • O português do login vem do SERVIDOR, por `err.error`, e não existe
 *     como literal em lugar nenhum do frontend.
 *
 * Três portas diferentes, nenhuma coberta. Este arquivo fecha as três.
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

// constants.js é script CLÁSSICO (globais léxicos, sem UMD) — mesmo
// carregador de tests/pointLabel.test.js.
const { ACCESS_POINTS, pointLabel } = new Function(
    ler('js', 'data', 'constants.js') + '\n;return { ACCESS_POINTS, pointLabel };'
)();

const PostoFixo = (() => {
    const mod = { exports: {} };
    new Function('module', 'exports', ler('js', 'utils', 'postoFixo.js'))(mod, mod.exports);
    return mod.exports;
})();

/**
 * Marcadores de português que NÃO existem em francês.
 *
 * `ã`/`õ` e `ç` seguido de vogal posterior são impossíveis em francês; as
 * palavras da lista são as que este projeto realmente produziu. Não é um
 * detector de idioma — é uma armadilha para as palavras que já caíram aqui.
 */
const MARCAS_PT = [
    /[ãõ]/,
    /\b(Entrada|Enfermaria|Refeit[óo]rio|Biblioteca|Servidor(es)?|Reconectando|Portaria|Sa[íi]da|Aluno)\b/i,
];

const cheiraPortugues = (txt) => MARCAS_PT.some(re => re.test(String(txt || '')));

describe('Os pontos de acesso — os cartões da tela de abertura', () => {

    it('★ nenhum nome nem legenda em português', () => {
        // Era ISTO que o dono estava vendo: seis legendas portuguesas sob
        // seis títulos franceses, na primeira tela que a direção abre.
        const sujos = [];
        for (const p of ACCESS_POINTS) {
            if (cheiraPortugues(p.nome)) sujos.push(`${p.id}.nome = ${p.nome}`);
            if (cheiraPortugues(p.description)) sujos.push(`${p.id}.description = ${p.description}`);
        }
        expect(sujos, 'js/data/constants.js — a interface é francesa').toEqual([]);
    });

    it('★ o CDI chama-se CDI, não "Biblioteca"', () => {
        // Um lycée francês tem um CDI (Centre de Documentation et
        // d'Information), com um professeur-documentaliste. «Bibliothèque»
        // é uma biblioteca municipal, e a direção ouve a diferença.
        // `pointLabel` alcança 7 telas e DUAS exportações CSV.
        expect(pointLabel('BIBLIO')).toBe('CDI');
        expect(pointLabel('BIBLIO')).not.toMatch(/Biblioteca/);
    });

    it('★ postoFixo.js e ACCESS_POINTS dizem a MESMA coisa', () => {
        // js/utils/postoFixo.js guarda uma segunda cópia dos rótulos e o
        // próprio cabeçalho dele se declara espelho consciente. Foi assim
        // que 'CDI - Biblioteca' passou a viver em dois lugares: consertar
        // um e esquecer o outro faz a linha do Journal discordar do cartão.
        // ⚠️ A comparação é sobre a INTERSEÇÃO, e isso é de propósito:
        // postoFixo lista só os SETE pontos FÍSICOS onde alguém pode estar
        // postado. As telas de monitor e relatório (CANTINA_MONITOR,
        // GENERAL_REPORT…) são pontos de NAVEGAÇÃO, não lugares — ninguém
        // fica postado num relatório. Exigir que ele as espelhasse seria o
        // teste a inventar uma regra que o código não tem.
        const espelhados = PostoFixo.PONTOS.map(p => p.id);
        expect(espelhados.length).toBeGreaterThan(0);
        for (const id of espelhados) {
            const oficial = ACCESS_POINTS.find(p => p.id === id);
            expect(oficial, `postoFixo cita ${id}, ausente de ACCESS_POINTS`).toBeTruthy();
            const rotulo = PostoFixo.rotuloDoPonto(id);
            expect(rotulo, `${id}: postoFixo diz "${rotulo}", ACCESS_POINTS diz "${oficial.nome}"`).toBe(oficial.nome);
        }
    });
});

describe('O rodapé — visível em TODA tela, login inclusive', () => {

    it('★ "Reconectando..." não está mais cravado em português', () => {
        const cs = ler('js', 'components', 'ConnectionStatus.js');
        expect(cs).not.toMatch(/'Reconectando\.\.\.'/);
        expect(cs).toMatch(/t\('status\.reconectando'\)/);
    });

    it('★ a chave existe nas DUAS línguas', () => {
        const i18n = ler('js', 'utils', 'i18n.js');
        expect(i18n.split("'status.reconectando':").length - 1).toBe(2);
    });
});

describe('A tela de login — o português vinha do SERVIDOR', () => {

    beforeEach(() => {
        globalThis.window = globalThis;
        globalThis.MagboI18n = { t: (k) => (k === 'api.credenciais' ? 'Identifiants invalides' : k) };
        globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    });

    it('★ credenciais inválidas dizem-no em FRANCÊS, não em português', async () => {
        // ⚠️ O DEFEITO, e por que era invisível: AuthController.java devolve
        // {"error":"Credenciais inválidas"}. O código fazia
        //     err.error || t('api.credenciais')
        // e `err.error` é SEMPRE verdadeiro num 401 — então o ramo da
        // tradução era código morto e a tradução francesa, que existe desde
        // sempre, nunca chegou à tela. Uma senha errada na tela francesa
        // imprimia português, e nenhum teste podia vê-lo porque a palavra
        // portuguesa não existe no frontend.
        new Function(ler('js', 'utils', 'auth.js'))();

        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Credenciais inválidas' })
        }));

        await expect(globalThis.auth.login('admin', 'errada'))
            .rejects.toThrow('Identifiants invalides');
    });

    it('★ sem i18n carregado, a razão do SERVIDOR chega à tela', async () => {
        // ⚠️ ESTE TESTE JÁ FOI VERDE PELO MOTIVO ERRADO, e é a lição que fica.
        // Ele afirmava `expect(src).toMatch(...)` — uma regex sobre o TEXTO do
        // arquivo. Em 03/09/2026 o código daquela forma foi removido, e a
        // asserção continuou VERDE porque passou a casar com o COMENTÁRIO que
        // explicava a remoção. Um guarda satisfeito por prosa não guarda nada:
        // ele fica verde exatamente quando o que ele protege deixou de existir.
        //
        // A regra que fica: guarda de COMPORTAMENTO, nunca de texto-fonte.
        // (`tests/i18nChavesUsadas.test.js` tira os comentários antes de
        //  varrer; este arquivo não, e foi essa diferença que o manteve verde.)
        //
        // O que é VERDADE hoje: num 401 a tradução vence, e `err.error` é a
        // saída de socorro para quando o i18n AINDA NÃO carregou — o que
        // acontece de verdade, porque a tela de login é a primeira a aparecer.
        new Function(ler('js', 'utils', 'auth.js'))();

        globalThis.MagboI18n = undefined;   // i18n ausente, de propósito
        globalThis.fetch = vi.fn(async () => ({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Conta desativada' })
        }));

        await expect(globalThis.auth.login('admin', 'x'))
            .rejects.toThrow('Conta desativada');
    });
});

describe('O vocabulário francês do pessoal — fechado e sem sobreposição', () => {

    const i18n = ler('js', 'utils', 'i18n.js');

    it('★ "Agent" continua a ser o TIPO FUNCIONARIO, e só isso', () => {
        // A aba listava PROFESSOR + FUNCIONARIO e chamava-se "Agents",
        // enquanto o enum ao lado dizia que "Agent" é justamente o que um
        // professeur NÃO é. O contentor tinha o nome de um dos seus dois
        // membros.
        expect(i18n).toMatch(/'enum\.tipo\.FUNCIONARIO': 'Agent',/);
        expect(i18n).toMatch(/'enum\.tipo\.PROFESSOR': 'Professeur',/);
    });

    it('★ a aba do pessoal chama-se "Personnels" (o superconjunto)', () => {
        // Termo-guarda-chuva da Éducation nationale / AEFE, o que a direção
        // usa: «les personnels enseignants et non-enseignants».
        expect(i18n).toMatch(/'cfg\.aba\.servidores': 'Personnels',/);
        expect(i18n).toMatch(/'cfg\.aba\.servidores': 'Funcionários',/);
    });

    it('★ "Servidor" em português só sobra onde significa SERVIDOR HTTP', () => {
        // ⚠️ O mesmo dicionário usa "servidor" ~20 vezes para dizer servidor
        // HTTP (api.erro.servidor, vue.servidor.online, status.offline). Foi
        // por isso que a troca teve de ser feita chave a chave, e não com um
        // substituir-tudo: duas das linhas alteradas continham OS DOIS
        // sentidos na mesma frase.
        const pt = i18n.slice(i18n.indexOf('        pt: {'));
        const linhasPessoa = pt.split('\n').filter(l =>
            /'(cfg\.aba\.servidores|cfg\.srv\.titulo|cfg\.man\.btn\.servidor|journal\.tipo\.pessoal)'/.test(l)
        );
        expect(linhasPessoa.length).toBeGreaterThanOrEqual(4);
        for (const l of linhasPessoa) {
            // ⚠️ Só o VALOR. Os nomes de CHAVE (`cfg.aba.servidores`) ficam
            // como estão de propósito: renomeá-los não muda nada na tela e
            // multiplica o diff — e o conflito com quem mais estiver neste
            // arquivo. Este teste reprovou contra si mesmo por ler a linha
            // inteira: a chave dizia "servidores" e o valor já dizia
            // "Funcionários".
            const valor = l.slice(l.indexOf(':') + 1);
            expect(valor, `ainda diz "Servidor" para gente: ${l.trim()}`).not.toMatch(/Servidor/i);
        }
    });
});
