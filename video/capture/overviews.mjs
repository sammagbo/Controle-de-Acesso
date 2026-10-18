// As telas de visão geral do vídeo do dia inteiro: o PPMS ao meio-dia, o Panneau administratif, o Rapport Général
// da semana e as estatísticas do CDI. Cada função parte da tela dita no comentário dela e grava as capturas pelo
// `shot` de capture-day.mjs, que confere cada tela antes de gravar. As caixas das capturas de página inteira são
// medidas com a página no topo, em coordenadas da página.
import { boxAround, boxOf, union } from './screens.mjs';

const top = (page) => page.evaluate(() => window.scrollTo(0, 0));

/** O PPMS: quantos estão dentro e em que zona, e depois a zona do CDI aberta, com os nomes de quem ainda está lá.
 *  De qualquer tela com o cabeçalho. */
export async function ppms(page, { shot, sleep, toDashboard, cdiNames }) {
      await toDashboard(page);
      await page.getByRole('button', { name: /^PPMS/ }).click();
      await page.getByText('Personnes à l’intérieur', { exact: true }).waitFor();
      await sleep(1500);
      const header = () => boxAround(page, 'Qui est à l’intérieur', { minWidth: 600, maxHeight: 100 });
      const total = () => boxOf(page.locator('div.ppms-zona.bg-navy-500'));
      const zones = page.locator('div.ppms-zona.bg-white');
      await top(page);
      const cards = union(...await Promise.all((await zones.all()).map(boxOf)));
      await shot(page, 'ppms-0', { header: await header(), total: await total(), zones: cards }, { fullPage: true });

      // o cabeçalho de cada zona é um botão; o do CDI abre a lista dela
      const cdi = zones.filter({ has: page.locator('button[aria-expanded]', { hasText: /^CDI/ }) });
      await cdi.locator('button[aria-expanded]').click();
      for (const who of cdiNames) await cdi.getByText(who, { exact: true }).waitFor();
      await sleep(800);
      await top(page);
      await shot(page, 'ppms-1', { total: await total(), zone: await boxOf(cdi) }, { fullPage: true });
}

/** O Panneau administratif: os indicadores do dia. Com o painel aberto, logo depois de openAdministration. */
export async function panneau(page, { shot, sleep }) {
      // os números chegam do servidor depois da tela: espera o primeiro que não seja zero
      await page.waitForFunction(() => {
            const label = [...document.querySelectorAll('p')].find((p) => p.textContent.trim() === 'Accès aujourd\'hui');
            return Number(label?.nextElementSibling?.textContent) > 0;
      }, null, { timeout: 15000 });
      await sleep(1000);
      await top(page);
      await shot(page, 'panneau', {
            header: await boxAround(page, 'Panneau administratif', { minWidth: 1000, maxHeight: 120 }),
            kpis: union(await boxAround(page, 'Accès aujourd\'hui', { minWidth: 1000, minHeight: 80 }),
                  await boxAround(page, 'Tentatives refusées', { minWidth: 1000, minHeight: 80 })),
      });
}

/** O Rapport Général, Vue d'ensemble, em «Cette Semaine»: os indicadores, a análise e os gráficos. Com o relatório
 *  aberto. */
export async function rapportSemaine(page, { shot, sleep }) {
      // a lista do «Voir qui» fecha antes, para a página ser a de sempre
      const hide = page.getByRole('button', { name: 'Masquer', exact: true }).first();
      if (await hide.isVisible().catch(() => false)) await hide.click();
      await page.getByRole('button', { name: 'Cette Semaine', exact: true }).click();
      // a barra de status diz o período carregado: na semana, as duas datas diferem
      await page.waitForFunction(() => {
            const period = document.body.innerText.match(/Période\s*:\s*(\d\d\/\d\d\/\d{4})\s*–\s*(\d\d\/\d\d\/\d{4})/);
            return !!period && period[1] !== period[2];
      }, null, { timeout: 20000 });
      await page.getByText('Répartition par Zone', { exact: true }).waitFor();
      await sleep(1500);
      await top(page);
      const attention = page.locator('div.rounded-2xl.p-4.mb-5', { has: page.locator('h3', { hasText: 'Points d\'attention' }) });
      await shot(page, 'rapport-2', {
            periods: await boxAround(page, 'Cette Semaine', { minWidth: 600, maxHeight: 100 }),
            indicators: await boxAround(page, 'Présents aujourd\'hui', { minWidth: 1000, minHeight: 80 }),
            analysis: await boxAround(page, 'Analyse de l\'Activité', { minWidth: 1000, minHeight: 60 }),
            hours: await boxAround(page, 'Affluence par Heure', { minWidth: 1000, minHeight: 120 }),
            zones: await boxAround(page, 'Répartition par Zone', { minWidth: 1000, minHeight: 80 }),
            flows: await boxAround(page, 'Entrées vs Sorties par zone', { minWidth: 1000, minHeight: 80 }),
            attention: await boxOf(attention),
            // as fichas das zonas e do portão, embaixo
            cards: await boxOf(page.locator('div.grid', { has: page.locator('div.border-dashed') }).last()),
      }, { fullPage: true });
}

/** As estatísticas do CDI em «Cette Semaine»: os números, a análise, os dois gráficos e as turmas. Com a tela do CDI
 *  aberta e sem outra janela; fecha a das estatísticas no fim, mesmo se algo falhar. */
export async function statsCdi(page, { shot, sleep }) {
      const panel = page.locator('div.max-w-3xl.overflow-y-auto', { has: page.getByText('Dashboard & Rapports', { exact: true }) });
      try {
            await page.locator('button[title="Statistiques"]').click();
            await panel.waitFor();
            // até a busca da semana voltar, a janela mostra as últimas 24 h e avisa: espera o aviso sumir
            await page.getByText(/Données limitées aux dernières 24/).waitFor({ state: 'hidden', timeout: 15000 });
            await panel.getByText('Fréquentation par Jour', { exact: true }).waitFor();
            await sleep(1500);
            await shot(page, 'cdi-stats', {
                  panel: await boxOf(panel),
                  kpis: await boxOf(panel.locator('div.grid-cols-4')),
                  analysis: await boxOf(panel.locator('div.bg-amber-50', { has: page.getByText('Analyse de l\'Activité', { exact: true }) })),
                  charts: await boxOf(panel.locator('div.grid-cols-2')),
                  levels: await boxOf(panel.locator('div.bg-slate-50', { has: page.getByText('Répartition par Niveau', { exact: true }) })),
            });
      } finally {
            // a janela fecha com um clique fora dela
            if (await panel.isVisible().catch(() => false)) await page.mouse.click(8, 8);
            await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      }
}
