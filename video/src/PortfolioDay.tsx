import {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, Easing, Img, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import displaySemibold from '@fontsource/funnel-display/files/funnel-display-latin-600-normal.woff2';

// O dia inteiro do MAGBO Access Control no Lycée Molière, para o cartão do projeto em sammagbo.com: 1600 x 1000,
// 30 fps, sem som, em loop (o último quadro é o primeiro). Do login às 07:28 ao fechamento das 17:00, e a semana em
// números no fim. Só as 27 capturas reais de video/capture/capture-day.mjs, em public/portfolio-day/ (fora do git:
// rodar run-day.sh antes de renderizar).
//
// A regra é a legibilidade no site, onde o vídeo aparece a 45 % do tamanho. Em cada vista de leitura, o texto de que
// a legenda fala sai com 30 px ou mais no quadro (corpo na tela x zoom), os rótulos que o explicam com 24 px ou mais,
// e a vista fica parada 2,5 s ou mais, no máximo com um pan de 60 px CSS por segundo. dayPlan() confere isso vista a
// vista e para o render se alguma sair da regra.

const FPS = 30;
const BLACK = '#000000';
const WHITE = '#F2F0EB';
const RED = '#FF3D2E'; // só para marcar as recusas
const LINE = '#34322F'; // o contorno do chip da hora, o mesmo dos chips do site

// A tela do app ocupa a largura inteira do quadro: cada pixel de largura é zoom no texto. As vistas têm as proporções
// das capturas (16:10), e a faixa da legenda esconde o pé delas.
const SCREEN = {width: 1600, height: 1000};
const RATIO = SCREEN.height / SCREEN.width;

// A faixa de baixo (BAND) é da legenda, à esquerda, e do chip da hora, à direita: a tela do app termina acima dela, e
// nada do app passa por trás das letras. A faixa é preta como o fundo do sammagbo.com, e no tema escuro do site ela
// some na página. O que se lê fica a 10 px ou mais das bordas da tela (EDGE): acima de READ_HEIGHT, a 10 px da faixa.
const BAND = 140;
const CAPTION = {size: 58, left: 56, dot: 20, gap: 18};
const CHIP = {size: 42, padY: 12, padX: 26, border: 3, right: 56};
const EDGE = 10;
const READ_HEIGHT = SCREEN.height - BAND - EDGE;

// As regras do lote, conferidas por dayPlan().
const RULES = {mainPx: 30, labelPx: 24, minRead: 2.5 * FPS, maxPan: 60, enter: [15, 24], chars: 42, seconds: [90, 110]};
const SWAP = 15; // a troca de uma captura por outra no mesmo enquadramento (o formulário preenchido, o direito dado)

type Box = {x: number; y: number; width: number; height: number};
type Size = {width: number; height: number};
type Manifest = {viewport: Size; shots: Record<string, Record<string, Partial<Box> | null>>};
// Um enquadramento da captura, em pixels CSS dela: o centro e a largura (a altura segue a proporção do quadro).
type View = {cx: number; cy: number; w: number};
type Boxes = (shot: string, name: string) => Box;

/** Uma vista de leitura: o enquadramento, o que se lê nele e o corpo, na tela, desse texto. */
type Look = {
  view: View;
  to?: View; // o fim de um pan lento, na mesma largura
  read: Box; // o texto lido, que precisa caber acima da faixa da legenda
  readTo?: Box; // o texto lido no fim do pan
  px: number; // o corpo do texto de que a legenda fala
  labelPx?: number; // o corpo dos rótulos que o explicam
  inside?: Box; // a vista inteira fica dentro desta caixa: fora dela, a barra SafeTrack, o rodapé do CDI ou um aviso
  mark?: Box; // a moldura vermelha de uma recusa
};

type Step = {
  shot: string;
  enter: number; // os quadros da transição que traz esta vista
  move?: boolean; // a câmera viaja da vista anterior, na mesma tela; sem isso, as duas telas se fundem
  hold: number; // os quadros em que a vista fica parada (ou num pan lento)
  chip: string;
  swap?: {shot: string; at: number}; // outra captura no mesmo enquadramento, a `at` quadros do início da vista
  look: (b: Boxes) => Look;
};
type Scene = {caption?: string; refused?: boolean; steps: Step[]};

const ease = Easing.bezier(0.65, 0, 0.35, 1);
const fade = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

const topOf = (view: View) => view.cy - (view.w * RATIO) / 2;
const zoomOf = (view: View) => SCREEN.width / view.w;

/**
 * A vista de largura `w` que põe `read` no meio: na horizontal (mais `dx`) e na parte do quadro acima da legenda, ou
 * com o alto em `top`.
 */
const around = (read: Box, w: number, {dx = 0, top}: {dx?: number; top?: number} = {}): View => {
  const visible = (READ_HEIGHT * w) / SCREEN.width;
  const y = top ?? read.y + read.height / 2 - visible / 2;
  return {cx: read.x + read.width / 2 + dx, cy: y + (w * RATIO) / 2, w};
};

/** A mesma vista, empurrada o mínimo para ficar inteira dentro de `bounds`. */
const within = (view: View, bounds: Box): View => {
  const h = view.w * RATIO;
  return {
    w: view.w,
    cx: Math.min(Math.max(view.cx, bounds.x + view.w / 2), bounds.x + bounds.width - view.w / 2),
    cy: Math.min(Math.max(view.cy, bounds.y + h / 2), bounds.y + bounds.height - h / 2),
  };
};

const pan = (view: View, dx: number): View => ({...view, cx: view.cx + dx});
const grow = (box: Box, by: number): Box => ({x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by});

// As vistas, a partir das caixas que capture-day.mjs mediu em cada captura. Os deslocamentos fixos foram medidos nas
// próprias capturas (a 2x), a partir dessas caixas.

// O formulário de login, de «Bienvenue» ao botão «Accéder»: o mesmo em login-0, login-1 e logout.
const login = (b: Boxes): Look => {
  const form = b('login-1', 'form');
  const read = {x: form.x, y: form.y + 80, width: form.width, height: 361};
  return {view: around(read, 738), read, px: 14, labelPx: 12};
};

// Os três contadores do Tableau de bord, da borda esquerda deles (a do título da grade, logo abaixo, que não sai
// cortado) ao fim de «POINTS D'ACCÈS»: 765 px, numa vista de 800 (os rótulos de 12 px pedem zoom 2).
const counters = (b: Boxes): Look => {
  const box = b('dashboard', 'counters');
  const read = {x: box.x + 1, y: box.y, width: box.width - 24, height: box.height};
  return {view: around(read, 800), read, px: 24, labelPx: 12};
};

// As duas primeiras linhas da grade dos postos, num pan das colunas 1 a 3 às colunas 2 a 4 (até «Centre de
// Documentation»). O alto do quadro fica abaixo do subtítulo da grade.
const grid = (b: Boxes): Look => {
  const box = b('dashboard', 'grid');
  const read = {x: box.x + 20, y: box.y + 16, width: 800, height: 360};
  const view = around(read, 907, {dx: 10, top: box.y - 18});
  return {view, to: pan(view, 150), read, readTo: {...read, x: box.x + 294, width: 728}, px: 18, labelPx: 14};
};

// «Derniers passages» no portão, de manhã: o cabeçalho com o total e as três primeiras linhas, dos avatares às horas.
const gateMorning = (b: Boxes): Look => {
  const list = b('portail', 'list');
  const read = {x: list.x + 21, y: list.y + 12, width: 657, height: 268};
  return {view: around(read, 680, {top: list.y - 18}), read, px: 14, labelPx: 12};
};
// À tarde, só as linhas, do nome ao sentido da passagem: o alto do quadro fica abaixo do cabeçalho da lista, e os
// avatares, à esquerda, ficam de fora.
const gateEvening = (b: Boxes): Look => {
  const rows = b('portail-sortie', 'rows');
  const read = {x: rows.x + 80, y: rows.y, width: 597, height: rows.height};
  return {view: around(read, 640, {dx: 11.5, top: rows.y - 7}), read, px: 12};
};

// O CDI: o número de presentes e os três primeiros cartões, dentro de `body` (sem a barra SafeTrack nem o rodapé). As
// telas fin-0 e fin-1 são a mesma tela do CDI e usam a mesma caixa.
const cdiRead = (body: Box): Box => ({x: body.x + body.width / 2 + 20, y: body.y + 14, width: body.width / 2 - 40, height: 332});
// `body` começa na linha de baixo da barra: a vista começa 2 px abaixo dela.
const cdiBody = (b: Boxes): Box => {
  const body = b('cdi', 'body');
  return {...body, y: body.y + 2, height: body.height - 2};
};
const cdiPresent = (b: Boxes): Look => {
  const body = cdiBody(b);
  return {view: within(around(cdiRead(body), 720), body), read: cdiRead(body), px: 16, labelPx: 12, inside: body};
};
// Depois do fechamento: «0 / 50» e «Vide», no mesmo enquadramento.
const cdiEmpty = (b: Boxes): Look => {
  const body = cdiBody(b);
  const read = {x: body.x + (body.width * 3) / 4 - 24, y: body.y + 14, width: 48, height: 248};
  return {view: within(around(cdiRead(body), 720), body), read, px: 16, inside: body};
};

// A coluna «Dans la cantine»: o título com o número e os dois primeiros cartões, com o alto do quadro abaixo das
// pílulas de contagem.
const cantine = (b: Boxes, shot: string): Look => {
  const column = b(shot, 'column');
  const read = {x: column.x + 12, y: column.y + 12, width: column.width - 12, height: 212};
  return {view: within(around(read, 557, {top: column.y - 16}), b(shot, 'page')), read, px: 12};
};

// A recusa da Lina na lista das tentativas recusadas da cantina, com o título da lista, abaixo do cabeçalho do app.
const mealRefusal = (b: Boxes): Look => {
  const feed = b('cantine-2', 'feed');
  const row = b('cantine-2', 'row');
  const read = {x: row.x, y: feed.y + 4, width: row.width, height: row.y + row.height - feed.y - 4};
  return {view: around(read, 536, {top: feed.y - 22}), read, px: 11, labelPx: 10, mark: grow(row, 8)};
};

// A linha da Lina na tela de direitos, do avatar ao status, com a busca «Exemple» e o cabeçalho da tabela. O aviso
// do alto da tela fica acima de y = 100 e fora do quadro.
const rights = (b: Boxes, shot: string): Look => {
  const row = b(shot, 'row');
  const read = {x: row.x + 23, y: row.y - 90, width: 602, height: 151};
  return {view: around(read, 639, {top: row.y - 208}), read, px: 12, labelPx: 10, inside: {x: 0, y: 100, width: 1440, height: 800}};
};

// O PPMS: o título, o subtítulo com «Lycée Molière» e o total; depois as zonas; depois a zona do CDI aberta.
const ppmsTotal = (b: Boxes): Look => {
  const header = b('ppms-0', 'header');
  const total = b('ppms-0', 'total');
  const read = {x: header.x, y: header.y, width: 728, height: total.y + total.height - header.y};
  return {view: around(read, 746, {top: header.y - 18}), read, px: 14, labelPx: 12};
};
const ppmsZones = (b: Boxes): Look => {
  // a última zona termina na borda da página: a vista encosta no fim dela
  const zones = b('ppms-0', 'zones');
  const read = {x: zones.x + 8, y: zones.y, width: zones.width - 16, height: zones.height - 17};
  return {view: within(around(read, 810), b('ppms-0', 'page')), read, px: 16};
};
const ppmsCdi = (b: Boxes): Look => {
  const zone = b('ppms-1', 'zone');
  const read = {x: zone.x + 10, y: zone.y + 8, width: 530, height: 282};
  return {view: around(read, 588), read, px: 18, labelPx: 12};
};

// O Panneau administratif. Os rótulos dos indicadores têm 10 px, e a vista não passa de 666 px de largura: uma vista
// mostra o título, o subtítulo com «Lycée Molière» e os indicadores da esquerda (accès, autorisés, alertes, tentatives
// refusées); a outra, «Dans les zones spéciales» e «Divergences», à direita. «Bloqués», entre as duas, ficaria cortado
// em qualquer uma e fica de fora.
const panneauLeft = (b: Boxes): Look => {
  const header = b('panneau', 'header');
  const read = {x: header.x, y: header.y + 4, width: 633, height: 318};
  return {view: around(read, 660), read, px: 24, labelPx: 10};
};
const panneauRight = (b: Boxes): Look => {
  const kpis = b('panneau', 'kpis');
  const read = {x: kpis.x + 846, y: kpis.y + 24, width: 342, height: 190};
  return {view: within(around(read, 558, {dx: 40}), b('panneau', 'page')), read, px: 30, labelPx: 10};
};

// A recusa do Noah no portão: o título da lista e a linha, até o motivo (a matrícula, à direita, fica de fora).
const exitRefusal = (b: Boxes): Look => {
  const row = b('sorties-0', 'row');
  const read = {x: row.x - 54, y: row.y - 61, width: 434, height: 145};
  return {view: around(read, 567), read, px: 11, labelPx: 10, mark: {x: row.x - 60, y: row.y - 9, width: row.width + 68, height: row.height + 18}};
};

// A autorização de saída, de «Qui a autorisé» às horas de saída e de volta.
const exitForm = (b: Boxes): Look => {
  const form = b('sorties-1', 'form');
  const read = {x: form.x + 24, y: form.y + 228, width: 460, height: 309};
  return {view: around(read, 639), read, px: 14, labelPx: 12};
};

// A busca da Emma, sem o cabeçalho do app; depois o parcours dela.
const search = (b: Boxes): Look => {
  const read = b('recherche-0', 'search');
  return {view: around(read, 722, {top: read.y - 42}), read, px: 14, labelPx: 12};
};
const parcours = (b: Boxes): Look => {
  const box = b('recherche-1', 'parcours');
  const read = {x: box.x + 16, y: box.y + 4, width: 260, height: 262};
  return {view: around(read, 577, {dx: 132.5}), read, px: 12, labelPx: 10};
};

// O Rapport do dia: os cartões «Repas hors horaire» e «Sorties non enregistrées» de «Points d'attention», logo acima da
// lista em rapport-1 e no mesmo lugar em rapport-0 (a caixa `card` de rapport-0 mede outra coisa: a frase da análise);
// depois o começo da lista «Mouvements incomplets».
const attention = (b: Boxes): Look => {
  const list = b('rapport-1', 'list');
  const read = {x: list.x + 395, y: list.y - 101, width: 519, height: 68};
  return {view: around(read, 639), read, px: 12};
};
const incomplete = (b: Boxes): Look => {
  const list = b('rapport-1', 'list');
  const read = {x: list.x + 17, y: list.y + 21, width: 282, height: 278};
  return {view: around(read, 639, {dx: 157.5}), read, px: 12, labelPx: 11};
};

// A janela «Encore à l'intérieur» do CDI: o título, «Déjà clos aujourd'hui · 3» e as três linhas, com a borda esquerda
// do quadro na da janela e o alto logo abaixo do botão «Masquer». A janela começa sobre a barra SafeTrack, que fica
// fora do quadro.
const closure = (b: Boxes): Look => {
  const win = b('fin-1', 'window');
  const body = cdiBody(b);
  const read = {x: win.x, y: win.y + 4, width: 302, height: win.height - 4};
  return {view: within(around(read, 619, {dx: 137.5, top: win.y}), body), read, px: 12, inside: body};
};

// A semana no Rapport Général: os períodos e os três primeiros indicadores; o gráfico por hora, num pan até o pico do
// meio-dia e depois dele; o cartão da cantina.
const weekKpis = (b: Boxes): Look => {
  const periods = b('rapport-2', 'periods');
  const indicators = b('rapport-2', 'indicators');
  const read = {x: periods.x + 4, y: periods.y, width: 622, height: indicators.y + indicators.height - periods.y};
  return {view: around(read, 660, {top: periods.y - 45}), read, px: 24, labelPx: 12};
};
const weekHours = (b: Boxes): Look => {
  const hours = b('rapport-2', 'hours');
  const read = {x: hours.x + 14, y: hours.y + 12, width: 620, height: 175};
  const view = around(read, 660, {top: hours.y - 29});
  return {view, to: pan(view, 150), read, readTo: {...read, x: read.x + 150}, px: 14, labelPx: 10};
};
const weekCantine = (b: Boxes): Look => {
  const cards = b('rapport-2', 'cards');
  const read = {x: cards.x + 13, y: cards.y + 10, width: 548, height: 214};
  return {view: around(read, 619), read, px: 24, labelPx: 12};
};

// As estatísticas do CDI, sempre dentro de `panel` (o CDI escurecido em volta fica de fora): os números e a análise;
// um gráfico por vez; as turmas, com os dois gráficos inteiros acima delas.
const statsTop = (b: Boxes): Look => {
  const panel = b('cdi-stats', 'panel');
  const kpis = b('cdi-stats', 'kpis');
  const analysis = b('cdi-stats', 'analysis');
  const read = {x: kpis.x, y: panel.y + 10, width: kpis.width, height: analysis.y + analysis.height - panel.y - 10};
  return {view: within(around(read, 763), panel), read, px: 24, labelPx: 12, inside: panel};
};
const statsChart = (b: Boxes, half: 0 | 1): Look => {
  const panel = b('cdi-stats', 'panel');
  const charts = b('cdi-stats', 'charts');
  const read = {x: charts.x + 8 + half * (charts.width / 2 + 8), y: charts.y + 8, width: charts.width / 2 - 24, height: charts.height - 16};
  return {view: within(around(read, 577), panel), read, px: 12, inside: panel};
};
const statsLevels = (b: Boxes): Look => {
  const panel = b('cdi-stats', 'panel');
  const levels = b('cdi-stats', 'levels');
  const read = {x: levels.x + 12, y: levels.y + 4, width: levels.width - 22, height: levels.height - 6};
  return {view: within(around(read, 746), panel), read, px: 14, labelPx: 12, inside: panel};
};

// O roteiro. A hora do chip é a do relógio do cabeçalho de cada captura; as telas de direitos não mostram o
// cabeçalho e ficam com a hora da captura no log (11:56), e o fechamento é o das 17:00 da janela de fin-1.
const SCENES: Scene[] = [
  {caption: 'Connexion de la Vie scolaire.', steps: [{shot: 'login-0', enter: 0, hold: 132, chip: '07:28', swap: {shot: 'login-1', at: 40}, look: login}]},
  {
    caption: 'Tous les postes, un seul écran.',
    steps: [
      {shot: 'dashboard', enter: 18, hold: 78, chip: '07:29', look: counters},
      {shot: 'dashboard', enter: 18, move: true, hold: 84, chip: '07:29', look: grid},
    ],
  },
  // Sem o total na legenda: «26 passages (24 h)» tem 12 px, e para sair com 30 px a vista não teria o cabeçalho, os
  // avatares e as horas juntos. Ele aparece no cabeçalho, como rótulo (28 px).
  {caption: 'Portail : chaque élève, à la seconde près.', steps: [{shot: 'portail', enter: 18, hold: 84, chip: '07:46', look: gateMorning}]},
  {caption: 'CDI : 8 élèves présents.', steps: [{shot: 'cdi', enter: 18, hold: 78, chip: '10:06', look: cdiPresent}]},
  {
    caption: 'Reconnu au visage : il entre.',
    steps: [{shot: 'cantine-0', enter: 18, hold: 123, chip: '11:56', swap: {shot: 'cantine-1', at: 30}, look: (b) => cantine(b, 'cantine-1')}],
  },
  {caption: 'Badge sans droit au repas : refusé.', refused: true, steps: [{shot: 'cantine-2', enter: 21, move: true, hold: 84, chip: '11:56', look: mealRefusal}]},
  {
    caption: 'Droit accordé : elle entre.',
    steps: [
      {shot: 'droits-0', enter: 18, hold: 135, chip: '11:56', swap: {shot: 'droits-1', at: 42}, look: (b) => rights(b, 'droits-1')},
      {shot: 'cantine-3', enter: 18, hold: 78, chip: '11:57', look: (b) => cantine(b, 'cantine-3')},
    ],
  },
  {
    caption: 'PPMS : qui est à l’intérieur, et où.',
    steps: [
      {shot: 'ppms-0', enter: 18, hold: 84, chip: '11:57', look: ppmsTotal},
      {shot: 'ppms-0', enter: 18, move: true, hold: 84, chip: '11:57', look: ppmsZones},
    ],
  },
  {caption: 'Au CDI : Inès, Léo et Zoé.', steps: [{shot: 'ppms-1', enter: 21, move: true, hold: 84, chip: '11:57', look: ppmsCdi}]},
  {
    caption: 'Les indicateurs du jour, en direct.',
    steps: [
      {shot: 'panneau', enter: 18, hold: 84, chip: '16:16', look: panneauLeft},
      {shot: 'panneau', enter: 21, move: true, hold: 84, chip: '16:16', look: panneauRight},
    ],
  },
  {caption: 'Sortie sans autorisation : refusée.', refused: true, steps: [{shot: 'sorties-0', enter: 18, hold: 84, chip: '16:16', look: exitRefusal}]},
  // sorties-2 fica de fora: a linha da autorização ativa mostra «Du : 19/10/2026 02:00 / Au : 19/10/2026 02:00», e não
  // as 16:15 e 17:00 do formulário.
  {caption: 'La Vie scolaire autorise la sortie.', steps: [{shot: 'sorties-1', enter: 18, hold: 84, chip: '16:16', look: exitForm}]},
  {caption: 'Au portail : il sort.', steps: [{shot: 'portail-sortie', enter: 18, hold: 84, chip: '16:16', look: gateEvening}]},
  {
    caption: 'Où est Emma ? Son parcours du jour.',
    steps: [
      {shot: 'recherche-0', enter: 18, hold: 78, chip: '16:16', look: search},
      {shot: 'recherche-1', enter: 21, move: true, hold: 84, chip: '16:16', look: parcours},
    ],
  },
  {
    caption: 'Rapport : les sorties non enregistrées.',
    steps: [
      {shot: 'rapport-0', enter: 18, hold: 78, chip: '16:16', look: attention},
      {shot: 'rapport-1', enter: 24, move: true, hold: 84, chip: '16:16', look: incomplete},
    ],
  },
  {
    caption: 'Le système clôt la journée.',
    steps: [
      {shot: 'fin-0', enter: 18, hold: 78, chip: '17:00', look: cdiEmpty},
      {shot: 'fin-1', enter: 21, move: true, hold: 84, chip: '17:00', look: closure},
    ],
  },
  {
    caption: 'La semaine : heures de pointe et zones.',
    steps: [
      {shot: 'rapport-2', enter: 18, hold: 84, chip: 'Cette semaine', look: weekKpis},
      {shot: 'rapport-2', enter: 18, move: true, hold: 90, chip: 'Cette semaine', look: weekHours},
      {shot: 'rapport-2', enter: 24, move: true, hold: 84, chip: 'Cette semaine', look: weekCantine},
    ],
  },
  {
    caption: 'CDI : la fréquentation de la semaine.',
    steps: [
      {shot: 'cdi-stats', enter: 18, hold: 84, chip: 'Cette semaine', look: statsTop},
      {shot: 'cdi-stats', enter: 18, move: true, hold: 78, chip: 'Cette semaine', look: (b) => statsChart(b, 0)},
      {shot: 'cdi-stats', enter: 18, move: true, hold: 78, chip: 'Cette semaine', look: (b) => statsChart(b, 1)},
      {shot: 'cdi-stats', enter: 18, move: true, hold: 90, chip: 'Cette semaine', look: statsLevels},
    ],
  },
  // O fim do loop, sem legenda: a tela de login depois da saída volta ao primeiro quadro.
  {steps: [{shot: 'logout', enter: 18, hold: 48, chip: '07:28', swap: {shot: 'login-0', at: 30}, look: login}]},
];

type Timed = Step & {scene: number; start: number; hold0: number; end: number};

// A linha do tempo, em quadros: cada vista entra (transição de `enter` quadros) e fica `hold` quadros.
const TIMELINE: Timed[] = [];
SCENES.forEach((scene, index) =>
  scene.steps.forEach((step) => {
    const start = TIMELINE.length ? TIMELINE[TIMELINE.length - 1].end : 0;
    TIMELINE.push({...step, scene: index, start, hold0: start + step.enter, end: start + step.enter + step.hold});
  }),
);

export const PORTFOLIO_DAY = {width: SCREEN.width, height: SCREEN.height, fps: FPS, durationInFrames: TIMELINE[TIMELINE.length - 1].end};

/** Uma linha do plano: a vista, o zoom e o corpo no quadro do texto lido. */
export type PlanRow = {
  step: number;
  scene: number;
  shot: string;
  from: number; // o primeiro quadro da transição que traz a vista
  still: number; // o primeiro quadro com a vista parada
  swap?: number; // o quadro em que começa a troca de captura
  to: number; // o último quadro da vista
  width: number;
  zoom: number;
  mainPx: number;
  labelPx?: number;
  chip: string;
  caption?: string;
};

/** A largura de um texto em Funnel Display 600, no corpo dado; no navegador, para conferir a faixa de baixo. */
type Measure = (text: string, size: number) => number;

/**
 * As vistas de todas as cenas, a partir do manifest, conferidas contra as regras do lote. Para o render (com a lista
 * dos problemas) se uma vista não cumprir alguma.
 */
export const dayPlan = (manifest: Manifest, measure?: Measure): {looks: Look[]; rows: PlanRow[]} => {
  const box: Boxes = (shot, name) => {
    const found = manifest.shots[shot]?.[name];
    if (name === 'page') return {x: 0, y: 0, ...sizeOf(manifest, shot)};
    if (!found || [found.x, found.y, found.width, found.height].some((n) => typeof n !== 'number')) {
      throw new Error(`manifest.json has no ${name} in ${shot}: run video/capture/run-day.sh again`);
    }
    return found as Box;
  };
  const looks = TIMELINE.map((step) => step.look(box));
  const problems: string[] = [];
  const seconds = PORTFOLIO_DAY.durationInFrames / FPS;
  if (seconds < RULES.seconds[0] || seconds > RULES.seconds[1]) problems.push(`the video lasts ${seconds.toFixed(1)} s`);

  const rows = TIMELINE.map((step, k): PlanRow => {
    const look = looks[k];
    const name = `${k + 1} ${step.shot}`;
    const views = look.to ? [look.view, look.to] : [look.view];
    for (const view of views) {
      const left = view.cx - view.w / 2;
      const top = topOf(view);
      const bounds = look.inside ?? {x: 0, y: 0, ...sizeOf(manifest, step.shot)};
      if (left < bounds.x - 0.5 || top < bounds.y - 0.5 || left + view.w > bounds.x + bounds.width + 0.5 || top + view.w * RATIO > bounds.y + bounds.height + 0.5) {
        problems.push(`${name}: the view leaves ${look.inside ? 'its allowed area' : 'the capture'}`);
      }
    }
    if (k > 0 && (step.enter < RULES.enter[0] || step.enter > RULES.enter[1])) problems.push(`${name}: a transition of ${step.enter} frames`);
    const scene = SCENES[step.scene];
    const zoom = zoomOf(look.view);
    if (scene.caption) {
      // uma vista de leitura
      if (scene.caption.length > RULES.chars) problems.push(`${name}: the caption has ${scene.caption.length} characters`);
      if (measure) {
        const caption = measure(scene.caption, CAPTION.size) + (scene.refused ? CAPTION.dot + CAPTION.gap : 0);
        const chip = measure(step.chip, CHIP.size) + 2 * (CHIP.padX + CHIP.border);
        if (CAPTION.left + caption + 48 + chip + CHIP.right > SCREEN.width) problems.push(`${name}: the caption runs into the chip`);
      }
      if (look.px * zoom < RULES.mainPx) problems.push(`${name}: the text is ${(look.px * zoom).toFixed(1)} px`);
      if (look.labelPx && look.labelPx * zoom < RULES.labelPx) problems.push(`${name}: the labels are ${(look.labelPx * zoom).toFixed(1)} px`);
      // o tempo de leitura conta do fim da troca de captura e, no primeiro quadro, da entrada da legenda
      const reading = step.hold - Math.max(step.swap ? step.swap.at + SWAP : 0, k === 0 ? 16 : 0);
      if (reading < RULES.minRead) problems.push(`${name}: the view is read for ${(reading / FPS).toFixed(2)} s`);
      if (look.to) {
        const speed = Math.hypot(look.to.cx - look.view.cx, look.to.cy - look.view.cy) / (step.hold / FPS);
        if (look.to.w !== look.view.w) problems.push(`${name}: the pan zooms`);
        if (speed > RULES.maxPan) problems.push(`${name}: the pan runs at ${speed.toFixed(0)} px/s`);
      }
      const pairs: [View, Box][] = look.to ? [[look.view, look.read], [look.to, look.readTo ?? look.read]] : [[look.view, look.read]];
      for (const [view, read] of pairs) {
        const left = view.cx - view.w / 2;
        const top = topOf(view);
        const m = EDGE / zoom;
        if (read.x < left + m || read.x + read.width > left + view.w - m || read.y < top + m || read.y + read.height > top + READ_HEIGHT / zoom) {
          problems.push(`${name}: the text read does not fit above the band`);
        }
      }
    }
    return {
      step: k + 1,
      scene: step.scene + 1,
      shot: step.swap ? `${step.shot} → ${step.swap.shot}` : step.shot,
      from: step.start,
      still: step.hold0,
      swap: step.swap ? step.hold0 + step.swap.at : undefined,
      to: step.end - 1,
      width: look.view.w,
      zoom,
      mainPx: look.px * zoom,
      labelPx: look.labelPx ? look.labelPx * zoom : undefined,
      chip: step.chip,
      caption: scene.caption,
    };
  });

  // O loop: o último quadro mostra a mesma captura, no mesmo enquadramento e com o mesmo chip do primeiro.
  const first = TIMELINE[0];
  const last = TIMELINE[TIMELINE.length - 1];
  const sameView = JSON.stringify(looks[0].view) === JSON.stringify(looks[looks.length - 1].view);
  if (last.swap?.shot !== first.shot || !sameView || last.chip !== first.chip || last.hold < (last.swap?.at ?? 0) + SWAP + 1) {
    problems.push('the last frame is not the first one');
  }
  if (problems.length) throw new Error(`PortfolioDay breaks the legibility rules: ${problems.join('; ')}`);
  return {looks, rows};
};

const sizeOf = (manifest: Manifest, shot: string): Size => {
  const page = manifest.shots[shot]?.page;
  return page && typeof page.width === 'number' && typeof page.height === 'number' ? {width: page.width, height: page.height} : manifest.viewport;
};

const useAssets = (): Manifest | null => {
  const [handle] = useState(() => delayRender('portfolio-day captures and fonts'));
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    Promise.all([
      fetch(staticFile('portfolio-day/manifest.json')).then((res) => res.json() as Promise<Manifest>),
      new FontFace('Funnel Display', `url(${displaySemibold}) format('woff2')`, {weight: '600'}).load().then((face) => {
        document.fonts.add(face);
      }),
    ])
      .then(([loaded]) => {
        setManifest(loaded);
        continueRender(handle);
      })
      .catch((error) => cancelRender(error));
  }, [handle]);
  return manifest;
};

/** A largura de um texto em Funnel Display 600, medida no canvas do navegador (sem o letter-spacing negativo: folga). */
const measureText: Measure = (text, size) => {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  context.font = `600 ${size}px "Funnel Display"`;
  return context.measureText(text).width;
};

/** O enquadramento entre duas vistas: centro em linha reta, zoom em escala logarítmica. */
const mix = (a: View, b: View, t: number): View => ({
  cx: a.cx + (b.cx - a.cx) * t,
  cy: a.cy + (b.cy - a.cy) * t,
  w: Math.exp(Math.log(a.w) + (Math.log(b.w) - Math.log(a.w)) * t),
});

type Layer = {shot: string; view: View; opacity: number; mark?: Box; markOpacity?: number};

const Screen: React.FC<Layer & {size: Size}> = ({shot, view, opacity, size, mark, markOpacity = 0}) => {
  const scale = SCREEN.width / view.w;
  const left = view.cx - view.w / 2;
  const top = topOf(view);
  return (
    <AbsoluteFill style={{opacity}}>
      <Img
        src={staticFile(`portfolio-day/${shot}.png`)}
        style={{position: 'absolute', left: -left * scale, top: -top * scale, width: size.width * scale, height: size.height * scale}}
      />
      {mark && markOpacity > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: (mark.x - left) * scale - 6,
            top: (mark.y - top) * scale - 6,
            width: mark.width * scale + 12,
            height: mark.height * scale + 12,
            border: `5px solid ${RED}`,
            borderRadius: 24,
            opacity: markOpacity,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const lettering = (size: number): React.CSSProperties => ({
  position: 'absolute',
  color: WHITE,
  fontFamily: 'Funnel Display',
  fontWeight: 600,
  fontSize: size,
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
});

// A legenda, na faixa, à esquerda e no meio da altura dela: o texto direto no preto, sem pílula. Nas recusas, o ponto
// vermelho vem antes do texto.
const Caption: React.FC<{text: string; opacity: number; refused?: boolean}> = ({text, opacity, refused}) => (
  <div
    style={{
      ...lettering(CAPTION.size),
      left: CAPTION.left,
      top: SCREEN.height - BAND,
      height: BAND,
      display: 'flex',
      alignItems: 'center',
      gap: CAPTION.gap,
      letterSpacing: '-0.01em',
      opacity,
      transform: `translateY(${(1 - opacity) * 14}px)`,
    }}
  >
    {refused ? <span style={{width: CAPTION.dot, height: CAPTION.dot, borderRadius: '50%', background: RED, flex: 'none'}} /> : null}
    {text}
  </div>
);

// O chip da hora, na faixa, à direita e no meio da altura dela: só o contorno, como os chips do site.
const Chip: React.FC<{text: string; opacity: number}> = ({text, opacity}) => (
  <div
    style={{
      ...lettering(CHIP.size),
      right: CHIP.right,
      top: SCREEN.height - BAND / 2,
      transform: 'translateY(-50%)',
      boxSizing: 'border-box',
      padding: `${CHIP.padY}px ${CHIP.padX}px`,
      border: `${CHIP.border}px solid ${LINE}`,
      borderRadius: 999,
      fontVariantNumeric: 'tabular-nums',
      opacity,
    }}
  >
    {text}
  </div>
);

export const PortfolioDay: React.FC = () => {
  const frame = useCurrentFrame();
  const manifest = useAssets();
  const plan = useMemo(() => (manifest ? dayPlan(manifest, measureText) : null), [manifest]);
  if (!manifest || !plan) return <AbsoluteFill style={{background: BLACK}} />;
  const {looks} = plan;

  const i = Math.max(0, TIMELINE.findIndex((step) => frame < step.end));
  const step = TIMELINE[i];

  // O enquadramento de uma vista enquanto ela está na tela: parado, ou num pan em velocidade constante.
  const camera = (k: number, f: number): View => {
    const look = looks[k];
    if (!look.to) return look.view;
    return mix(look.view, look.to, Math.min(Math.max((f - TIMELINE[k].hold0) / TIMELINE[k].hold, 0), 1));
  };
  // As capturas de uma vista: a dela e, durante e depois da troca, a seguinte por cima (a de baixo sai quando a de
  // cima fica opaca, para o último quadro ser idêntico ao primeiro).
  const held = (k: number, f: number, view: View): Layer[] => {
    const s = TIMELINE[k];
    const look = looks[k];
    const markOpacity = fade(f, s.hold0 + 6, s.hold0 + 20);
    const base: Layer = {shot: s.shot, view, opacity: 1, mark: look.mark, markOpacity};
    if (!s.swap) return [base];
    const swapped = fade(f, s.hold0 + s.swap.at, s.hold0 + s.swap.at + SWAP);
    if (swapped >= 1) return [{...base, shot: s.swap.shot}];
    return swapped > 0 ? [base, {...base, shot: s.swap.shot, opacity: swapped}] : [base];
  };

  let layers: Layer[];
  let progress = 1; // o avanço da transição que trouxe a vista atual
  if (frame >= step.hold0 || i === 0) {
    layers = held(i, frame, camera(i, frame));
  } else {
    const prev = TIMELINE[i - 1];
    progress = ease((frame - step.start) / step.enter);
    const leaving = held(i - 1, prev.end - 1, camera(i - 1, prev.end - 1));
    const target = looks[i].view;
    if (step.move) {
      // a mesma tela: a câmera viaja, e a captura nova (a tela atualizada) aparece por cima
      const view = mix(camera(i - 1, prev.end - 1), target, progress);
      layers = [...leaving.map((layer) => ({...layer, view})), {shot: step.shot, view, opacity: progress}];
    } else {
      // outra tela: a nova se funde sobre a anterior, abrindo um pouco antes de parar
      layers = [...leaving, {shot: step.shot, view: {...target, w: target.w * (1 + 0.04 * (1 - progress))}, opacity: progress}];
    }
  }

  // A legenda e o chip: trocam no meio da transição de uma cena para outra; a primeira legenda entra depois do primeiro
  // quadro, para o loop não ter emenda.
  const scene = SCENES[step.scene];
  const prevStep = i > 0 && frame < step.hold0 ? TIMELINE[i - 1] : null;
  const prevScene = prevStep ? SCENES[prevStep.scene] : null;
  const out = 1 - interpolate(progress, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'});
  const into = interpolate(progress, [0.5, 1], [0, 1], {extrapolateLeft: 'clamp'});
  const captions: {text: string; refused?: boolean; opacity: number}[] = [];
  if (prevScene && prevScene !== scene) {
    if (prevScene.caption) captions.push({text: prevScene.caption, refused: prevScene.refused, opacity: out});
    if (scene.caption) captions.push({text: scene.caption, refused: scene.refused, opacity: into});
  } else if (scene.caption) {
    captions.push({text: scene.caption, refused: scene.refused, opacity: i === 0 ? fade(frame, 4, 16) : 1});
  }
  const chips =
    prevStep && prevStep.chip !== step.chip
      ? [
          {text: prevStep.chip, opacity: out},
          {text: step.chip, opacity: into},
        ]
      : [{text: step.chip, opacity: 1}];

  return (
    <AbsoluteFill style={{background: BLACK}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: SCREEN.width, height: SCREEN.height - BAND, overflow: 'hidden'}}>
        {layers
          .filter((layer) => layer.opacity > 0)
          .map((layer, k) => (
            <Screen key={`${k}-${layer.shot}`} {...layer} size={sizeOf(manifest, layer.shot)} />
          ))}
      </div>
      {captions
        .filter((caption) => caption.opacity > 0)
        .map((caption) => (
          <Caption key={caption.text} {...caption} />
        ))}
      {chips
        .filter((chip) => chip.opacity > 0)
        .map((chip) => (
          <Chip key={chip.text} {...chip} />
        ))}
    </AbsoluteFill>
  );
};
