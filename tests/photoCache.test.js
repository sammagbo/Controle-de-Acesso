import { describe, it, expect, beforeEach, vi } from 'vitest';
import C from '../js/utils/photoCache.js';

/**
 * CACHE DE FOTOS — a peça que existe porque o endpoint é AUTENTICADO.
 *
 * O navegador não manda o cabeçalho Authorization numa requisição de <img>. A
 * alternativa a este módulo seria abrir o endpoint da foto — e um endpoint
 * aberto de fotos de alunos é um catálogo de rostos de crianças a um GET de
 * distância, na mesma rede em que qualquer aparelho da escola está ligado.
 *
 * O que se cobra aqui é o comportamento de que a tela depende:
 *   • uma requisição por pessoa, mesmo com 50 linhas pedindo ao mesmo tempo;
 *   • quem não tem foto não é pedido de novo a cada ciclo de polling de 3 s;
 *   • falha de rede devolve null (a tela cai nas iniciais) e NÃO é lembrada
 *     como "não tem" — uma rede que piscou não pode apagar o rosto de alguém
 *     pelo resto da sessão;
 *   • o número de objectURLs vivos é limitado.
 */

/** URL.createObjectURL não existe no jsdom; contamos as criações e revogações. */
let criados;
let revogados;

beforeEach(() => {
    // ⚠️ A ORDEM aqui importa, e a primeira versão deste arquivo errou.
    //
    // O cache é um singleton de módulo — de propósito, é o que faz 50 linhas da
    // tela compartilharem uma requisição. Logo o estado ATRAVESSA os testes: o
    // C.clear() de limpeza revoga o que o teste anterior deixou vivo, e se ele
    // rodar depois de zerar os contadores essa revogação entra na conta deste
    // teste. Limpa-se primeiro, zera-se depois.
    globalThis.URL = {
        createObjectURL: () => 'blob:descartado',
        revokeObjectURL: () => {},
    };
    C.clear();

    criados = [];
    revogados = [];
    globalThis.URL = {
        createObjectURL: () => {
            const url = 'blob:magbo/' + criados.length;
            criados.push(url);
            return url;
        },
        revokeObjectURL: (url) => revogados.push(url),
    };
    C.configure(null);
});

const blobFake = () => ({ tipo: 'blob' });

describe('photoCache — uma requisição por pessoa', () => {

    it('busca uma vez e reaproveita a mesma URL', async () => {
        const buscar = vi.fn(async () => blobFake());
        C.configure(buscar);

        const a = await C.get('0004048');
        const b = await C.get('0004048');

        expect(buscar).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
        expect(criados).toHaveLength(1);
    });

    it('★ 50 linhas pedindo ao mesmo tempo geram UMA requisição', async () => {
        // O caso real: a tela do Portail recarrega a cada 3 s e renderiza até
        // 50 linhas de uma vez. Sem compartilhar a promessa em voo, isso seriam
        // 50 requisições por ciclo para a mesma pessoa.
        let resolver;
        const buscar = vi.fn(() => new Promise(r => { resolver = r; }));
        C.configure(buscar);

        const pedidos = Array.from({ length: 50 }, () => C.get('0004048'));
        resolver(blobFake());
        const urls = await Promise.all(pedidos);

        expect(buscar).toHaveBeenCalledTimes(1);
        expect(new Set(urls).size).toBe(1);
    });
});

describe('photoCache — quem não tem foto', () => {

    it('★ 404 é lembrado: não se pergunta de novo a cada ciclo de polling', async () => {
        const buscar = vi.fn(async () => null);
        C.configure(buscar);

        expect(await C.get('0004048')).toBeNull();
        expect(await C.get('0004048')).toBeNull();
        expect(await C.get('0004048')).toBeNull();

        expect(buscar).toHaveBeenCalledTimes(1);
        expect(C.stats().semFoto).toBe(1);
    });

    it('★ falha de REDE devolve null mas NÃO é lembrada como "não tem"', async () => {
        // A diferença importa: 404 é um fato (não há foto). Erro de rede é um
        // acidente — lembrá-lo faria a foto nunca mais ser tentada nesta
        // sessão, e o kiosk fica aberto o dia inteiro.
        const buscar = vi.fn()
            .mockRejectedValueOnce(new Error('rede caiu'))
            .mockResolvedValueOnce(blobFake());
        C.configure(buscar);

        expect(await C.get('0004048')).toBeNull();
        expect(C.stats().semFoto).toBe(0);

        expect(await C.get('0004048')).toBe('blob:magbo/0');
        expect(buscar).toHaveBeenCalledTimes(2);
    });

    it('sem função de busca configurada devolve null sem estourar', async () => {
        expect(await C.get('0004048')).toBeNull();
    });

    it('id vazio devolve null', async () => {
        C.configure(async () => blobFake());
        expect(await C.get('')).toBeNull();
        expect(await C.get(null)).toBeNull();
    });
});

describe('photoCache — a queda quando não há foto', () => {

    const INICIAIS = 'data:image/svg+xml;utf8,<svg/>';

    it('a foto importada vence tudo', () => {
        expect(C.srcEfetivo('blob:magbo/0', 'http://externa/foto.jpg', INICIAIS))
            .toBe('blob:magbo/0');
    });

    it('sem foto importada, o foto_url do cadastro vale — alguém o preencheu de propósito', () => {
        expect(C.srcEfetivo(null, 'http://externa/foto.jpg', INICIAIS))
            .toBe('http://externa/foto.jpg');
    });

    it('★ sem nada, cai nas INICIAIS — nunca num quadrado vazio', () => {
        // É a promessa que a tela faz em toda lista do sistema: a maioria das
        // 1200 pessoas não terá foto por muito tempo, e a linha da passagem não
        // pode ficar com um buraco no lugar do rosto.
        expect(C.srcEfetivo(null, null, INICIAIS)).toBe(INICIAIS);
        expect(C.srcEfetivo(undefined, '', INICIAIS)).toBe(INICIAIS);
        expect(C.srcEfetivo('', '   ', INICIAIS)).toBe(INICIAIS);
    });

    it('sem nem iniciais devolve string vazia, e não undefined', () => {
        // src={undefined} num <img> faz o navegador pedir a própria página como
        // imagem; string vazia simplesmente não carrega nada.
        expect(C.srcEfetivo(null, null, null)).toBe('');
    });
});

describe('photoCache — memória', () => {

    it('★ o número de objectURLs vivos respeita o teto, revogando os mais antigos', async () => {
        // Sem teto, um kiosk aberto o dia inteiro rolando 1200 pessoas acumula
        // blobs até o Electron engasgar.
        C.configure(async () => blobFake());

        for (let i = 0; i < C.MAX_VIVOS + 10; i++) {
            await C.get('pessoa-' + i);
        }

        expect(C.stats().vivos).toBe(C.MAX_VIVOS);
        expect(revogados).toHaveLength(10);
        // Os revogados são os PRIMEIROS pedidos, não os últimos.
        expect(revogados[0]).toBe('blob:magbo/0');
    });

    it('invalidate esquece a pessoa e revoga a URL', async () => {
        C.configure(async () => blobFake());
        await C.get('0004048');

        C.invalidate('0004048');

        expect(revogados).toContain('blob:magbo/0');
        expect(C.stats().vivos).toBe(0);
    });

    it('★ invalidate limpa também o "não tem" — a primeira foto tem que aparecer', async () => {
        // Quem acabou de receber a primeira foto continuaria com o avatar de
        // iniciais até o app reiniciar.
        const buscar = vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(blobFake());
        C.configure(buscar);

        expect(await C.get('0004048')).toBeNull();
        C.invalidate('0004048');
        expect(await C.get('0004048')).toBe('blob:magbo/0');
    });

    it('clear esquece todo mundo e revoga tudo', async () => {
        C.configure(async () => blobFake());
        await C.get('a');
        await C.get('b');

        C.clear();

        expect(revogados).toHaveLength(2);
        expect(C.stats()).toEqual({ vivos: 0, semFoto: 0, emVoo: 0, maxVivos: C.MAX_VIVOS });
    });
});
