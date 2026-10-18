// O histórico das duas semanas de aula antes do dia de captura, para as telas da semana do vídeo: o Rapport Général
// em «Cette Semaine» e as estatísticas do CDI. Os mesmos 30 alunos fictícios e o mesmo webhook das passagens do dia:
// o portão de manhã, o CDI, a cantina e a enfermaria.
//
//   MAGBO_DEMO_WEBHOOK_TOKEN=… node seed-history.mjs   envia as passagens dos 10 dias úteis antes de hoje
//   node seed-history.mjs --plan                       só mostra os dias e as contagens, sem enviar nada
//
// Rodar uma vez, numa instância nova, depois de seed-day.mjs e antes das capturas, com o relógio da demo no dia de
// captura. As passagens seguem as regras do backend:
// - Toda visita tem entrada e saída. Na cantina e na enfermaria, uma entrada sem saída contaria como «sortie non
//   enregistrée»; no CDI ela ficaria aberta, porque o fechamento das 17:00 só fecha o dia corrente.
// - No portão, só as entradas: nos terminais, uma saída sem autorisation de sortie é recusada e iria para as
//   tentativas recusadas. As telas da semana contam os setores internos, não o portão.
// - Na cantina, só quem tem direito à refeição (nem a Lina Exemple nem o Tom Exemple), com a entrada entre 11:50 e
//   12:30 (o créneau das 12:00 de seed-day.mjs vai de 11:45 a 12:45) e no máximo 28 minutos dentro (o limite é 30).
// - O webhook aceita até 30 dias no passado: os 10 dias úteis cabem em 14.
// O sorteio tem semente fixa: o mesmo histórico, e os mesmos números nas telas, em toda rodada.
import { demo } from './demo.mjs';

const plan = process.argv.includes('--plan');

// mulberry32: um sorteio pequeno com semente, o mesmo em todo Node
let seed = 20261019;
const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min, max) => min + random() * (max - min);
const pick = (list) => list[Math.floor(random() * list.length)];
/** Um item da lista, com a chance de cada um proporcional ao peso dele. */
const weighted = (list, weight) => {
      let left = random() * list.reduce((sum, item) => sum + weight(item), 0);
      for (const item of list) if ((left -= weight(item)) < 0) return item;
      return list.at(-1);
};
const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60 + m) * 60; };
const clock = (seconds) => [seconds / 3600, (seconds % 3600) / 60, seconds % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');

// Por dia da semana: visitas ao CDI, visitas à enfermaria e a parte dos presentes que almoça. A quarta é meio dia.
const PROFILE = {
      1: { cdi: 10, infirmary: 2, lunch: 0.9 },
      2: { cdi: 14, infirmary: 1, lunch: 0.92 },
      3: { cdi: 8, infirmary: 1, lunch: 0.55, morningOnly: true },
      4: { cdi: 13, infirmary: 2, lunch: 0.9 },
      5: { cdi: 11, infirmary: 2, lunch: 0.85 },
};
// A hora de entrada no CDI (o peso de cada hora) e quem vai mais: os terminales preparam o bac.
const CDI_HOURS = [[8, 4], [9, 6], [10, 10], [11, 5], [12, 2], [13, 11], [14, 8], [15, 7], [16, 3]];
const CLASS_WEIGHT = { T1: 3, '1E2': 2.2, '2E1': 1.5 };
// Os dois séjours prolongés da enfermaria (mais de 30 min), um em cada semana: a semana mais recente é a da tela.
const LONG_STAYS = [{ recent: false, weekday: 4, minutes: 38 }, { recent: true, weekday: 2, minutes: 41 }];

// Os 10 dias úteis antes de hoje, no relógio da demo, do mais antigo ao mais recente.
const today = demo.today();
const days = [];
for (let back = 1; days.length < 10; back++) {
      const date = new Date(Date.parse(`${today}T00:00:00Z`) - back * 86_400_000);
      const weekday = date.getUTCDay();
      if (weekday >= 1 && weekday <= 5) days.unshift({ day: date.toISOString().slice(0, 10), weekday, recent: back <= 7 });
}

const events = [];
const summary = [];
for (const { day, weekday, recent } of days) {
      const profile = PROFILE[weekday];
      const busy = new Map(); // por aluno, os intervalos já ocupados no dia, em segundos
      const free = (id, start, end) => (busy.get(id) ?? []).every(([a, b]) => end <= a || start >= b);
      const count = { gate: 0, BIBLIO: 0, REFEI1: 0, ENFERM: 0 };
      const visit = (id, point, start, end) => {
            events.push({ day, at: start, id, point, action: 'ENTRADA' }, { day, at: end, id, point, action: 'SAIDA' });
            busy.set(id, [...(busy.get(id) ?? []), [start, end]]);
            count[point]++;
      };

      // Um ou dois ausentes por dia; os outros passam o portão entre 07:26 e 08:02, mais perto das 07:44.
      const absent = new Set();
      const absentCount = 1 + Math.floor(random() * 2);
      while (absent.size < absentCount) absent.add(pick(demo.students).id);
      const present = demo.students.filter((student) => !absent.has(student.id));
      for (const student of present) {
            const at = minutes('07:26') + Math.floor(36 * 60 * (random() + random()) / 2);
            const method = demo.gateByCard.includes(student.id) ? 'card' : 'face';
            events.push({ day, at, id: student.id, point: 'PORT1', action: 'ENTRADA', method });
            count.gate++;
      }

      // A cantina primeiro, porque o almoço ocupa a hora do meio-dia de quem come.
      for (const student of present) {
            if (demo.refused.includes(student.id) || random() >= profile.lunch) continue;
            const start = minutes('11:50') + Math.floor(40 * 60 * (random() + random()) / 2);
            visit(student.id, 'REFEI1', start, start + Math.floor(between(15, 28) * 60));
      }

      // O CDI: no máximo uma visita por aluno, de 20 a 65 minutos, a partir de 08:05 e até 16:55. Na semana mais recente,
      // com o bac blanc chegando, um pouco mais de gente.
      const hours = CDI_HOURS.filter(([hour]) => !profile.morningOnly || hour < 12);
      const wanted = profile.cdi + (recent ? 2 : -1) + Math.floor(random() * 3) - 1;
      const pool = [...present];
      for (let tries = 0; count.BIBLIO < wanted && pool.length && tries < 300; tries++) {
            const student = weighted(pool, (who) => CLASS_WEIGHT[who.turma]);
            const [hour] = weighted(hours, ([, weight]) => weight);
            const start = hour * 3600 + Math.floor(between(5, 50) * 60);
            const end = Math.min(start + Math.floor(between(20, 65) * 60), minutes('16:55'));
            if (end - start < 15 * 60 || !free(student.id, start, end)) continue;
            visit(student.id, 'BIBLIO', start, end);
            pool.splice(pool.indexOf(student), 1);
      }

      // A enfermaria: visitas de 8 a 22 minutos entre 09:00 e 15:30, uma por aluno, e o séjour prolongé do dia.
      const long = LONG_STAYS.find((stay) => stay.weekday === weekday && stay.recent === recent);
      const visits = profile.infirmary + (long ? 1 : 0);
      const patients = [...present];
      for (let tries = 0; count.ENFERM < visits && patients.length && tries < 300; tries++) {
            const student = pick(patients);
            const start = minutes('09:00') + Math.floor(between(0, 390) * 60);
            const length = long && count.ENFERM === 0 ? long.minutes * 60 : Math.floor(between(8, 22) * 60);
            if (!free(student.id, start, start + length)) continue;
            visit(student.id, 'ENFERM', start, start + length);
            patients.splice(patients.indexOf(student), 1);
      }

      const label = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]} ${day.slice(8, 10)}/${day.slice(5, 7)}`;
      const stay = long ? ` (one of ${long.minutes} min)` : '';
      summary.push(`${label}: gate ${count.gate}, CDI ${count.BIBLIO} visits, cantine ${count.REFEI1} meals, infirmary ${count.ENFERM}${stay}`);
}
events.sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at);
const internal = events.filter((event) => event.point !== 'PORT1').length;

console.log(`history: ${days[0].day} to ${days.at(-1).day}, ${days.length} school days before ${today}`);
for (const line of summary) console.log(`  ${line}`);
console.log(`  ${events.length} passes, ${internal} of them in the CDI, the cantine and the infirmary`);
if (plan) process.exit(0);

// Numa instância que já tem o histórico, as passagens dobrariam: para antes de enviar.
const token = await demo.login();
const first = days[0].day, last = days.at(-1).day;
const overview = () => demo.api(token, 'GET', `/api/access/overview?dateFrom=${first}&dateTo=${last}`);
if ((await overview()).totalMovements !== 0) {
      throw new Error(`the instance already has passes between ${first} and ${last}: run the history once, on a new instance`);
}

for (const event of events) {
      const at = demo.at(event.day, clock(event.at));
      await demo.passAt(event.id, event.method ?? 'face', { point: event.point, action: event.action, at });
}

// A conferência: o que as telas da semana vão contar, e nenhuma tentativa recusada nos dias do histórico.
const seen = await overview();
const expected = { totalMovements: internal, unregisteredExits: 0, offScheduleMeals: 0, longInfirmaryStays: LONG_STAYS.length };
const wrong = Object.entries(expected).filter(([key, value]) => seen[key] !== value);
if (wrong.length) {
      throw new Error(`the history does not add up: ${wrong.map(([key, value]) => `${key} ${seen[key]} instead of ${value}`).join(', ')}`);
}
const attempts = await demo.api(token, 'GET', `/api/access/attempts?from=${first}T00:00:00&to=${last}T23:59:59&size=1`);
if ((attempts.content ?? []).length) {
      throw new Error(`the history left refused attempts, the first: ${JSON.stringify(attempts.content[0])}`);
}
console.log(`history sent: ${events.length} passes; the two weeks count ${seen.totalMovements} movements, no exit missing, `
      + `no meal off the slot, ${seen.longInfirmaryStays} long infirmary stays, no refused attempt`);
