// =====================================================================
// FOTOS DE IDENTIFICAÇÃO — cache de imagens autenticadas
// =====================================================================
// ⚠️ POR QUE ISTO EXISTE, e não um simples <img src="/api/users/X/photo">.
//
// O endpoint da foto EXIGE autenticação, e o navegador NÃO manda o cabeçalho
// Authorization numa requisição de <img>. A alternativa seria abrir o endpoint
// "só para o kiosk" — e um endpoint aberto de fotos de alunos é um catálogo de
// rostos de crianças a um GET de distância, na mesma rede em que qualquer
// aparelho da escola está ligado.
//
// Então a imagem é buscada por fetch, com o token, e vira um objectURL local.
// É mais código; é o único jeito de a URL não existir para quem não fez login.
//
// O que este módulo garante:
//   • uma requisição por pessoa, mesmo com 50 linhas na tela pedindo ao mesmo
//     tempo (as chamadas simultâneas compartilham a mesma promessa);
//   • quem não tem foto é lembrado como "não tem" e não é pedido de novo a cada
//     ciclo de polling de 3 s;
//   • o número de objectURLs vivos é limitado — sem isso, um kiosk aberto o dia
//     inteiro sobre 1200 pessoas acumularia blobs até o Electron engasgar.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboPhotoCache, via <script> no index.html
//   • Vitest    → module.exports (package.json não tem "type": "module")

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboPhotoCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Teto de objectURLs vivos.
     *
     * Cada um segura os bytes da imagem na memória do renderer até ser
     * revogado. 300 × ~20KB ≈ 6MB, que é confortável; 1200 sem teto, num
     * kiosk que fica dias aberto rolando listas, não é.
     */
    const MAX_VIVOS = 300;

    /** userId -> objectURL. Map preserva ordem de inserção = LRU aproximado. */
    const vivos = new Map();
    /** userId -> Promise em voo, para 50 linhas não virarem 50 requisições. */
    const emVoo = new Map();
    /** userIds que o servidor já disse não ter foto (404). */
    const semFoto = new Set();

    /** Injetável para teste; no app é o fetch do navegador. */
    let buscar = null;

    /**
     * @param fn (userId) => Promise<Blob|null>   null = não tem foto
     */
    function configure(fn) {
        buscar = typeof fn === 'function' ? fn : null;
    }

    /**
     * URL local da foto de uma pessoa, ou null quando não há.
     *
     * null é uma resposta legítima e frequente — a tela cai no avatar de
     * iniciais, que é exatamente o que ela já faz hoje. Erro de rede também
     * devolve null: uma foto que não carregou nunca pode impedir a linha da
     * passagem de aparecer.
     */
    /**
     * A foto JA EM CACHE, sincronamente — ou null, sem disparar busca nenhuma.
     *
     * ⚠️ Existe por causa do SCINTILLEMENT do Moniteur Cantine (27/08/2026):
     * um componente remontado recomecava em `useState(null)`, pintava as
     * iniciais, e SO no microtask seguinte a promessa do cache (ja resolvida!)
     * entregava o objectURL. Resultado: foto -> iniciais -> foto a cada
     * remontagem. Com o peek, um remonte legitimo (a pessoa mudou de coluna,
     * a arvore mudou de pai) hidrata a foto no PRIMEIRO paint.
     */
    function peek(userId) {
        if (!userId) return null;
        return vivos.has(userId) ? vivos.get(userId) : null;
    }

    async function get(userId) {
        if (!userId || !buscar) return null;
        if (vivos.has(userId)) return vivos.get(userId);
        if (semFoto.has(userId)) return null;
        if (emVoo.has(userId)) return emVoo.get(userId);

        const promessa = (async () => {
            try {
                const blob = await buscar(userId);
                if (!blob) { semFoto.add(userId); return null; }
                const url = URL.createObjectURL(blob);
                guardar(userId, url);
                return url;
            } catch (e) {
                // Sem foto é melhor que sem tela. Não marca semFoto: uma falha
                // de rede é passageira, e marcar faria a foto nunca mais ser
                // tentada nesta sessão.
                return null;
            } finally {
                emVoo.delete(userId);
            }
        })();

        emVoo.set(userId, promessa);
        return promessa;
    }

    /** Guarda respeitando o teto, revogando o mais antigo. */
    function guardar(userId, url) {
        vivos.set(userId, url);
        while (vivos.size > MAX_VIVOS) {
            const maisAntigo = vivos.keys().next().value;
            revogar(maisAntigo);
        }
    }

    function revogar(userId) {
        const url = vivos.get(userId);
        if (url) {
            vivos.delete(userId);
            if (typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(url);
        }
    }

    /**
     * Esquece uma pessoa — depois de trocar ou apagar a foto dela.
     *
     * Limpa também o "não tem": quem acabou de receber a primeira foto
     * continuaria com o avatar de iniciais até o app reiniciar.
     */
    function invalidate(userId) {
        revogar(userId);
        semFoto.delete(userId);
        emVoo.delete(userId);
    }

    /** Esquece todo mundo — usado depois de uma importação em lote. */
    function clear() {
        [...vivos.keys()].forEach(revogar);
        semFoto.clear();
        emVoo.clear();
    }

    /**
     * A QUEDA, em uma função — qual imagem a tela mostra de fato.
     *
     * Vive aqui, e não dentro do componente, para poder ser testada: é ela que
     * garante que uma pessoa sem foto nunca fica com um quadrado vazio, e essa
     * é a promessa que a tela faz em toda lista do sistema.
     *
     * A ordem, e o porquê de cada degrau:
     *   1. foto importada — o retrato que a escola cadastrou;
     *   2. foto_url       — override por pessoa, que já existia antes disto;
     *                       quem o preencheu decidiu, e a decisão vale;
     *   3. iniciais       — SVG inline, sempre funciona, inclusive num kiosk
     *                       sem rede (risco R1 do projeto).
     */
    function srcEfetivo(urlDaFoto, fotoUrl, iniciais) {
        return naoVazio(urlDaFoto) || naoVazio(fotoUrl) || naoVazio(iniciais) || '';
    }

    function naoVazio(v) {
        return (typeof v === 'string' && v.trim()) ? v : null;
    }

    /** Números para teste e diagnóstico. */
    function stats() {
        return { vivos: vivos.size, semFoto: semFoto.size, emVoo: emVoo.size, maxVivos: MAX_VIVOS };
    }

    return {
        MAX_VIVOS: MAX_VIVOS,
        configure: configure,
        peek: peek,
        get: get,
        invalidate: invalidate,
        clear: clear,
        srcEfetivo: srcEfetivo,
        stats: stats
    };
});
