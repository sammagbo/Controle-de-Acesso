import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import gate from '../scripts/verify-package.js';
import indexAssets from '../scripts/indexAssets.js';

/**
 * O PORTÃO DE RELEASE.
 *
 * Ele responde duas perguntas sobre o app.asar entregue à escola: "vazou algo
 * interno?" e "está tudo que o app precisa?". A segunda era conferida contra
 * uma lista ESTÁTICA de 26 nomes, escrita antes de postoFixo.js, photoCache.js
 * e PersonPhoto.js existirem — então um pacote sem esses três era APROVADO.
 *
 * É a mesma classe de acidente das duas tags perdidas no index.html em
 * 06/08/2026, só que na hora de empacotar: nada dá erro, o portão diz OK, e o
 * defeito aparece na tela do operador. Uma lista à mão só sabe do que existia
 * no dia em que alguém a escreveu.
 *
 * Agora a lista é DERIVADA do index.html — que, num projeto sem bundler, É a
 * lista de dependências do app, porque é a única coisa que faz um arquivo
 * existir em runtime. O que este arquivo cobra é justamente isso: que seja
 * derivada, e não uma segunda cópia que possa envelhecer igual.
 */

const REPO = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

/** Um pacote "perfeito": exatamente o que o index.html manda, nada a mais. */
function pacoteCompleto() {
    return indexAssets.requiredPackageFiles();
}

describe('portão de release (verify-package)', () => {

    describe('1. a lista obrigatória é DERIVADA do index.html', () => {

        it('★ tirar um <script> do index.html tira o arquivo da exigência', () => {
            // A prova de que é derivada e não copiada. Com uma lista à mão,
            // mexer no index.html não muda nada aqui — e é exatamente essa
            // independência que deixou três módulos fora do portão.
            const alvo = 'js/utils/postoFixo.js';
            expect(indexAssets.requiredPackageFiles(HTML)).toContain(alvo);

            const semTag = HTML.replace(
                new RegExp(`\\s*<script[^>]*src="${alvo}[^"]*"[^>]*></script>`), '');
            expect(semTag, 'a tag deveria ter sido removida do HTML de teste').not.toContain(alvo);

            const exigidoDepois = indexAssets.requiredPackageFiles(semTag);
            expect(exigidoDepois).not.toContain(alvo);
            expect(exigidoDepois).toHaveLength(
                indexAssets.requiredPackageFiles(HTML).length - 1);
        });

        it('★ acrescentar um <script> acrescenta a exigência', () => {
            // O sentido que importa de verdade: arquivo NOVO entra sozinho.
            // Nenhum passo manual entre criar o módulo e o portão cobrá-lo.
            const novo = 'js/utils/moduloQueAindaNaoExiste.js';
            const comTag = HTML.replace('</body>',
                `<script src="${novo}?v=1"></script></body>`);
            expect(indexAssets.requiredPackageFiles(comTag)).toContain(novo);
        });

        it('★ os três módulos que a lista estática não conhecia são exigidos', () => {
            // Regressão nomeada: são os que motivaram a mudança.
            const exigidos = pacoteCompleto();
            expect(exigidos).toContain('js/utils/postoFixo.js');
            expect(exigidos).toContain('js/utils/photoCache.js');
            expect(exigidos).toContain('js/components/PersonPhoto.js');
        });

        it('★ os dois módulos da tela branca de 06/08 são exigidos', () => {
            const exigidos = pacoteCompleto();
            expect(exigidos).toContain('js/utils/permissions.js');
            expect(exigidos).toContain('js/utils/mealEntitlement.js');
        });

        it('o cache-buster ?v= não vira um arquivo inexistente', () => {
            // O index.html escreve `js/utils/auth.js?v=1`; no disco e no pacote
            // o arquivo é `js/utils/auth.js`. Sem tirar o sufixo, o portão
            // pediria um arquivo que nunca existiu e reprovaria todo pacote.
            const exigidos = pacoteCompleto();
            expect(exigidos).toContain('js/utils/auth.js');
            expect(exigidos.filter(f => f.includes('?'))).toEqual([]);
        });

        it('todo arquivo exigido existe no repositório', () => {
            // Se o portão pede algo que não existe no disco, ele reprova todo
            // pacote possível — e o erro pareceria do build.
            const inexistentes = pacoteCompleto()
                .filter(f => !fs.existsSync(path.join(REPO, f)));
            expect(inexistentes).toEqual([]);
        });

        it('os quatro pontos de entrada continuam explícitos', () => {
            // main.js e preload.js são quem CARREGA a página — não há como a
            // página declará-los. É a única parte que segue escrita à mão, e
            // ela não cresce.
            expect(indexAssets.ENTRYPOINTS)
                .toEqual(['main.js', 'preload.js', 'index.html', 'package.json']);
            for (const f of indexAssets.ENTRYPOINTS) {
                expect(pacoteCompleto()).toContain(f);
            }
        });
    });

    describe('2. o veredito', () => {

        it('★ APROVA um pacote completo', () => {
            const r = gate.analisar(pacoteCompleto());
            expect(r.missing).toEqual([]);
            expect(r.leaks).toEqual([]);
        });

        it('★ REPROVA quando falta um arquivo que o index.html carrega', () => {
            const completo = pacoteCompleto();
            const semUm = completo.filter(f => f !== 'js/utils/photoCache.js');

            const r = gate.analisar(semUm);
            expect(r.missing).toEqual(['js/utils/photoCache.js']);
        });

        it('★ REPROVA o pacote de 06/08 — sem os módulos criados depois dele', () => {
            // O caso real: um pacote velho tem todos os nomes da lista estática
            // antiga e nenhum dos módulos novos. Ele PASSAVA no portão.
            const velho = pacoteCompleto().filter(f => ![
                'js/utils/postoFixo.js',
                'js/utils/photoCache.js',
                'js/components/PersonPhoto.js',
                'js/utils/permissions.js',
                'js/utils/mealEntitlement.js',
            ].includes(f));

            const r = gate.analisar(velho);
            expect(r.missing).toHaveLength(5);
            expect(r.missing).toContain('js/components/PersonPhoto.js');
        });

        it('a falta de um ponto de entrada também reprova', () => {
            const r = gate.analisar(pacoteCompleto().filter(f => f !== 'preload.js'));
            expect(r.missing).toEqual(['preload.js']);
        });
    });

    describe('3. as regras de exclusão continuam as mesmas', () => {

        it('★ são 17, e nenhuma foi afrouxada para o pacote passar', () => {
            // O portão reprova o dist/ atual. A tentação seria relaxar aqui.
            expect(gate.FORBIDDEN).toHaveLength(17);
        });

        it('★ vazamento continua sendo pego', () => {
            const comLixo = [
                ...pacoteCompleto(),
                'docs/architecture/ESPECIFICACAO-TECNICA-v1.md',
                '.claude/rules/backend.md',
                'deploy/.env',
                'backend/pom.xml',
                'scripts/verify-package.js',
            ];
            const r = gate.analisar(comLixo);
            expect(r.missing).toEqual([]);
            const vazados = [...new Set(r.leaks.map(l => l.file))];
            expect(vazados).toHaveLength(5);
        });

        it('um pacote limpo não dispara nenhuma regra de exclusão', () => {
            expect(gate.analisar(pacoteCompleto()).leaks).toEqual([]);
        });
    });

    describe('4. o parser é o mesmo do wiring.test.js', () => {

        it('★ uma leitura só do index.html — não há segundo parser', () => {
            // Enquanto havia dois, eles podiam discordar sobre o que a página
            // carrega, e o que o portão não enxergasse ele não exigiria.
            const doParser = indexAssets.scriptSources(HTML)
                .filter(s => s.arquivo.startsWith('js/')).map(s => s.arquivo);

            // A leitura literal que o wiring.test.js fazia antes, congelada
            // aqui: se o parser compartilhado divergir dela, este teste cai.
            const comoEraAntes = [...HTML.matchAll(
                /<script[^>]*\ssrc="(js\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);

            expect(doParser).toEqual(comoEraAntes);
            expect(doParser.length).toBeGreaterThan(30);
        });

        it('libs/ e css/ entram no portão, mesmo não sendo módulos do app', () => {
            // O wiring.test.js filtra para js/ (só esses publicam window.Magbo*),
            // mas o PACOTE precisa das bibliotecas e da folha de estilo — sem
            // elas o app abre sem React e sem CSS.
            const exigidos = pacoteCompleto();
            expect(exigidos).toContain('libs/react-18.3.1.min.js');
            expect(exigidos).toContain('libs/fonts.css');
            expect(exigidos).toContain('css/styles.css');
        });

        it('endereço remoto não vira arquivo obrigatório', () => {
            // Um CDN no index.html (risco R1) não é um arquivo do pacote — e
            // pedi-lo faria o portão reprovar por um motivo errado.
            const comCdn = HTML.replace('</body>',
                '<script src="https://cdn.tailwindcss.com"></script></body>');
            expect(indexAssets.requiredPackageFiles(comCdn))
                .toEqual(indexAssets.requiredPackageFiles(HTML));
            expect(indexAssets.referenciasRemotas(comCdn)).toHaveLength(1);
        });

        it('o index.html de hoje não cita nenhum endereço remoto (R1)', () => {
            expect(indexAssets.referenciasRemotas(HTML)).toEqual([]);
        });
    });
});
