import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ErrorBoundary — a rede que faltava, e a trava que a mantém no lugar.
 *
 * ⚠️ O QUE ESTE TESTE **NÃO** PROVA, e é preciso dizer alto: ele não
 * renderiza React nenhum. Nenhuma suíte deste projeto renderiza. A prova de
 * que o boundary CAPTURA um erro foi feita à mão, no app Electron real, em
 * 20/08/2026 — trocando window.SectorView por um componente que lança e
 * verificando que o fallback aparece, que o Header e o rodapé sobrevivem e
 * que o botão de volta devolve ao painel (11 verificações, screenshot em
 * %TEMP%\magbo-driver\boundary-erro-capturado-*.png).
 *
 * O que ESTE arquivo trava é o que um teste de texto consegue travar e que
 * é justamente o que se perde num merge: que o arquivo continue carregado,
 * na ordem certa, que os pontos de costura continuem costurados, e que o
 * fallback não ganhe uma dependência que possa faltar na hora do erro.
 */

const REPO = path.resolve(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

/**
 * Remove comentários antes de procurar por CÓDIGO.
 *
 * ⚠️ Escrito depois de o teste reprovar a si mesmo: as regras abaixo proíbem
 * `LucideIcon` e `window.api` DENTRO do fallback, e o ErrorBoundary explica
 * nos comentários por que os proíbe — então a busca em texto cru acusava a
 * própria justificativa. Um teste que não distingue a regra da explicação da
 * regra ensina a apagar a explicação, que é o contrário do que este projeto
 * faz.
 *
 * Não é um parser: uma `//` dentro de string literal seria cortada. Serve
 * porque o que se procura aqui são identificadores, e nenhum deles vive
 * dentro de string neste arquivo.
 */
const semComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/([^:'"`])\/\/.*$/gm, '$1');

const BOUNDARY_BRUTO = ler('js', 'components', 'ErrorBoundary.js');
const BOUNDARY = semComentarios(BOUNDARY_BRUTO);
const APP = semComentarios(ler('js', 'App.js'));
const INDEX = ler('index.html');
const I18N = ler('js', 'utils', 'i18n.js');

describe('ErrorBoundary — o componente', () => {

    it('★ implementa os DOIS ganchos do React (um só não basta)', () => {
        // getDerivedStateFromError troca a árvore pelo fallback;
        // componentDidCatch é o que dá acesso ao componentStack (o nome do
        // componente que quebrou). Sem o segundo, o registro no console não
        // diz ONDE quebrou — que é a única coisa útil no dia seguinte.
        expect(BOUNDARY).toMatch(/static\s+getDerivedStateFromError/);
        expect(BOUNDARY).toMatch(/componentDidCatch/);
    });

    it('★ REGRA Nº 1 — o fallback não pode depender do lucide', () => {
        // Um <LucideIcon> dentro do fallback significa: se o lucide não
        // carregou, o fallback lança, o erro sobe para o boundary de cima e
        // a tela volta a ficar branca — com a rede acionada e inútil.
        expect(BOUNDARY).not.toMatch(/LucideIcon/);
        expect(BOUNDARY).toMatch(/<svg/);
    });

    it('★ REGRA Nº 1 — a tradução do fallback tem francês cravado por baixo', () => {
        // window.MagboI18n pode não existir (ordem de <script>) ou `t` pode
        // lançar. `textoDeErro` é try/catch com o texto francês como último
        // recurso: numa escola francesa, degradar para francês feio é certo;
        // degradar para tela vazia ou para a chave crua, não.
        expect(BOUNDARY).toMatch(/function\s+textoDeErro/);
        expect(BOUNDARY).toMatch(/catch/);
        expect(BOUNDARY).toMatch(/return padrao/);
    });

    it('★ o fallback não toca em DADO nenhum', () => {
        // Só conhece o que recebeu por prop. Ler userCache/api/ACCESS_POINTS
        // aqui é convidar a segunda exceção para dentro da tela de erro.
        for (const proibido of ['window.userCache', 'window.api', 'ACCESS_POINTS', 'fetch(']) {
            expect(BOUNDARY.includes(proibido), proibido).toBe(false);
        }
    });

    it('★ tem a variante `discret`, e ela não desenha nada', () => {
        // O cromo (Toast, ConnectionStatus) é montado em toda tela. A falha
        // dele deve custar o cromo, não a tela — e também não pode virar um
        // aviso vermelho permanente, que estragaria a tela de outro jeito.
        expect(BOUNDARY).toMatch(/variante === 'discret'/);
        expect(BOUNDARY).toMatch(/discret'\)\s*return null/);
    });

    it('★ `resetKey` existe — senão o boundary fica preso no fallback', () => {
        // Sem isto, uma tela que quebrou continuaria mostrando o erro depois
        // de o operador navegar para outra: o boundary não sabe que mudou de
        // assunto.
        expect(BOUNDARY).toMatch(/componentDidUpdate/);
        expect(BOUNDARY).toMatch(/resetKey/);
    });
});

describe('ErrorBoundary — a fiação (o que um merge apaga em silêncio)', () => {

    it('★ está carregado no index.html', () => {
        expect(INDEX).toMatch(/js\/components\/ErrorBoundary\.js/);
    });

    it('★ carrega ANTES de App.js e antes dos outros componentes', () => {
        // Um componente que se envolve num boundary ainda não definido recebe
        // `undefined` como tipo de elemento e quebra na renderização — o
        // desastre que este arquivo existe para evitar, causado pela ordem
        // dos <script>. Sem bundler, a ordem é a única garantia que existe.
        const posBoundary = INDEX.indexOf('js/components/ErrorBoundary.js');
        const posApp = INDEX.indexOf('js/App.js');
        expect(posBoundary).toBeGreaterThan(-1);
        expect(posApp).toBeGreaterThan(-1);
        expect(posBoundary).toBeLessThan(posApp);

        // …e antes do PRIMEIRO outro componente carregado.
        const outros = [...INDEX.matchAll(/js\/components\/([A-Za-z]+)\.js/g)]
            .filter(m => m[1] !== 'ErrorBoundary');
        expect(outros.length).toBeGreaterThan(0);
        expect(posBoundary).toBeLessThan(outros[0].index);
    });

    it('★ a RAIZ está envolvida — é o único que cobre um erro no próprio App', () => {
        // Os hooks e os efeitos do App renderizam ACIMA de todos os boundaries
        // internos. Foi exatamente aí que estourou o defeito de 48ffa19 (ordem
        // de hooks no Toast), e é o caso que continuaria dando tela branca sem
        // esta rede.
        expect(APP).toMatch(/root\.render\(\s*<ErrorBoundary/);
    });

    it('★ a TELA ATUAL está envolvida, com nome e com volta', () => {
        // A rede que mais vale: o erro de uma tela custa a tela, e o Header
        // continua desenhado com o caminho de volta funcionando.
        expect(APP).toMatch(/<ErrorBoundary[\s\S]{0,400}resetKey=/);
        expect(APP).toMatch(/onRetour=/);
    });

    it('★ os MODAIS estão envolvidos na variante `modal`', () => {
        const modais = [...APP.matchAll(/variante="modal"/g)];
        // Passagem (portaria), passagem (setor) e Paramètres. Um modal que
        // quebra não pode levar junto a tela que está atrás dele.
        expect(modais.length).toBeGreaterThanOrEqual(3);
    });

    it('★ o CROMO está envolvido na variante `discret`', () => {
        expect(APP).toMatch(/variante="discret"[\s\S]{0,200}<Toast/);
        expect(APP).toMatch(/variante="discret"[\s\S]{0,200}<ConnectionStatus/);
    });

    it('★ o CDI e o LOGIN têm a sua própria rede', () => {
        // As duas telas que renderizam FORA do cromo comum: se elas quebram,
        // não sobra nem Header nem rodapé — o boundary é o único caminho.
        expect(APP).toMatch(/<ErrorBoundary[\s\S]{0,300}<BibliotecaView/);
        expect(APP).toMatch(/<ErrorBoundary[\s\S]{0,300}<LoginScreen/);
    });
});

describe('ErrorBoundary — os textos', () => {

    it('★ toda chave usada existe nos DOIS dicionários', () => {
        const usadas = [...BOUNDARY.matchAll(/textoDeErro\('([^']+)'/g)].map(m => m[1])
            .concat([...APP.matchAll(/t\('(erro\.[^']+)'\)/g)].map(m => m[1]));
        expect(usadas.length).toBeGreaterThan(5);

        for (const chave of [...new Set(usadas)]) {
            // Duas ocorrências = uma em `fr`, uma em `pt`. Uma só significa
            // que a tela de erro fala a outra língua — ou cai no texto cravado
            // e ninguém percebe que a tradução sumiu.
            const n = I18N.split(`'${chave}':`).length - 1;
            expect(n, `${chave} deveria aparecer em fr E em pt (achei ${n})`).toBe(2);
        }
    });
});
