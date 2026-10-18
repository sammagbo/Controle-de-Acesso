// O que os scripts de video/capture/ compartilham: a instância demo, os alunos fictícios e a API.
import { readFileSync } from 'node:fs';

const env = (name, fallback) => process.env[name] ?? fallback;

// Os alunos vêm só do arquivo de demo: os scripts nunca citam mais ninguém.
const csv = readFileSync(new URL('../../backend/src/test/resources/demo/eleves-demo.csv', import.meta.url), 'utf8');
const students = csv.trim().split('\n').slice(1).map((line) => {
      const [id, name, , turma] = line.split(';');
      return { id, name, turma };
});

// O fuso da demo, o mesmo do TZ do backend em docker-compose.demo.yml. Não aparece no vídeo.
const SCHOOL_ZONE = 'Europe/Paris';

// Os mapeamentos padrão que o sistema cria (DoorMappingBootstrap): leitor 1 = entrada, leitor 2 = saída.
const DOORS = { PORT1: 1, BIBLIO: 4, ENFERM: 5, REFEI1: 6 };
const READERS = { ENTRADA: 1, SAIDA: 2 };

// O relógio simulado do run-day.sh: o offset, em segundos, que o libfaketime soma ao relógio real do backend
// («+86400» = um dia depois). Os scripts somam o mesmo offset, para ficarem na hora do backend. Sem o arquivo, o
// relógio é o real.
const CLOCK_FILE = env('MAGBO_DEMO_CLOCK', '/tmp/magbo-demo-clock/faketime.rc');
const clockOffsetMs = () => {
      let spec;
      try {
            spec = readFileSync(CLOCK_FILE, 'utf8').trim();
      } catch (error) {
            if (error.code === 'ENOENT') return 0;
            throw error;
      }
      if (!/^[+-]\d+$/.test(spec)) throw new Error(`${CLOCK_FILE}: «${spec}» is not an offset in seconds`);
      return Number(spec) * 1000;
};

/** As partes da data e da hora de `date` no fuso da demo. */
const zoneParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: SCHOOL_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map((part) => [part.type, part.value]));

/** A hora local de `date` no fuso da demo, sem offset («2026-10-19T07:30:00»). O backend guarda uma hora sem
 *  offset como ela vem e a compara com a hora de recepção, que segue o TZ do container; uma hora com offset
 *  seria convertida para America/Sao_Paulo (EventTimeResolver.ZONA_ESCOLA) e ficaria 5 h antes. */
const localStamp = (date) => {
      const p = zoneParts(date);
      return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
};

// O backend descarta um serialNo repetido por 60 s: um contador por processo, a partir do relógio.
let serial = Date.now();

export const demo = {
      apiUrl: env('MAGBO_DEMO_API', 'http://localhost:8080'),
      frontend: env('MAGBO_DEMO_FRONTEND', 'http://localhost/'),
      backendContainer: 'magbo-demo-backend',
      schoolZone: SCHOOL_ZONE,
      students,
      classes: [...new Set(students.map((student) => student.turma))],
      // recusados explicitamente (NOT_AUTHORIZED); os outros ficam AUTHORIZED
      refused: ['9000002', '9000010'],
      // passam o crachá no portão, os outros o rosto: o mesmo no dia (capture-day.mjs) e no histórico (seed-history.mjs)
      gateByCard: ['9000005', '9000012', '9000018', '9000021', '9000024', '9000026'],
      // o terminal simulado da cantina do Lote 14; as portas 1 a 6 são os mapeamentos padrão da escola
      terminal: { doorNo: 9, readerNo: 1 },
      byId: (id) => students.find((student) => student.id === id),

      // o administrador padrão do perfil dev numa instância local nova
      admin: { username: env('MAGBO_DEMO_ADMIN', 'admin'), password: env('MAGBO_DEMO_ADMIN_PASSWORD', 'admin1234') },
      // o nome que ele mostra no cabeçalho das telas (seed-day.mjs)
      adminName: 'Administrateur Démo',
      // o PIN de administração do docker-compose.yml da raiz: digitado num campo mascarado, nunca capturado
      adminPin: env('MAGBO_DEMO_ADMIN_PIN', '1234'),

      async login() {
            const res = await fetch(`${this.apiUrl}/api/auth/login`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(this.admin),
            });
            if (!res.ok) throw new Error(`login failed: ${res.status}`);
            const body = await res.json();
            return body.token ?? body.accessToken;
      },

      async api(token, method, path, body) {
            const res = await fetch(`${this.apiUrl}${path}`, {
                  method,
                  headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                  body: body ? JSON.stringify(body) : undefined,
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
            return text ? JSON.parse(text) : null;
      },

      /** Para tudo se a licença de demonstração não estiver VALIDE: as telas mostrariam o aviso. */
      async assertLicenceValid(token) {
            const licence = await this.api(token, 'GET', '/api/licence');
            const state = { etat: licence.etat, bandeau: licence.bandeau, gestionOuverte: licence.gestionOuverte };
            console.log(`licence: ${JSON.stringify(state)}`);
            if (state.etat !== 'VALIDE' || state.bandeau !== false || state.gestionOuverte !== true) {
                  throw new Error('the demo licence is not VALIDE: stop, no screen may show a licence warning');
            }
      },

      /** Agora, no relógio da demo: o real, ou o simulado do run-day.sh. */
      now() {
            return new Date(Date.now() + clockOffsetMs());
      },

      /** O dia (1 = segunda) e a hora da escola, arredondada para baixo em `roundMinutes`. */
      schoolNow(roundMinutes = 1) {
            const parts = zoneParts(this.now());
            const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
            const minute = Math.floor(Number(parts.minute) / roundMinutes) * roundMinutes;
            return { day, hour: `${parts.hour}:${String(minute).padStart(2, '0')}` };
      },

      /** Hoje no relógio da demo, no fuso da demo («2026-10-19»). */
      today() {
            const p = zoneParts(this.now());
            return `${p.year}-${p.month}-${p.day}`;
      },

      /** Um dia («2026-10-19») a uma hora («HH:MM» ou «HH:MM:SS»), no fuso da demo. */
      at(day, time) {
            const [year, month, date] = day.split('-').map(Number);
            const [h, m, s = 0] = time.split(':').map(Number);
            // o instante cuja hora local no fuso da demo é a pedida: parte do UTC e corrige pelo offset do dia
            const guess = Date.UTC(year, month - 1, date, h, m, s);
            const seen = zoneParts(new Date(guess));
            const offset = Date.UTC(Number(seen.year), Number(seen.month) - 1, Number(seen.day), Number(seen.hour), Number(seen.minute), Number(seen.second)) - guess;
            return new Date(guess - offset);
      },

      /** Hoje no relógio da demo, a esta hora («HH:MM»), no fuso da demo. */
      todayAt(hhmm) {
            return this.at(this.today(), hhmm);
      },

      /** Abre um créneau de refeição para as turmas da demo, hoje, na hora atual da escola. O créneau vai de 15 min
       *  antes a 45 min depois da hora; sem ele, cada passagem também é gravada como «créneau non configuré» e
       *  aparece entre as tentativas recusadas. */
      async openMealService(token) {
            const { day, hour } = this.schoolNow(5);
            const slot = await this.api(token, 'POST', '/api/admin/meal-slots', { diaSemana: day, hora: hour, rotulo: 'Service démo', ordem: 1 });
            for (const turma of this.classes) await this.api(token, 'POST', `/api/admin/meal-slots/${slot.id}/turmas/${turma}`);
            return `day ${day} at ${hour} for ${this.classes.join(', ')}`;
      },

      /** Um AccessControllerEvent da Hikvision no webhook. subEventType 75 = rosto reconhecido, 1 = crachá. */
      async webhook(id, method, doorNo, readerNo, at) {
            const token = process.env.MAGBO_DEMO_WEBHOOK_TOKEN;
            if (!token) throw new Error('set MAGBO_DEMO_WEBHOOK_TOKEN to the token given to the demo backend');
            const res = await fetch(`${this.apiUrl}/api/hikvision/webhook`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-MAGBO-WEBHOOK-TOKEN': token },
                  body: JSON.stringify({
                        dateTime: localStamp(at),
                        AccessControllerEvent: {
                              employeeNoString: id,
                              majorEventType: 5,
                              subEventType: method === 'face' ? 75 : 1,
                              doorNo,
                              readerNo,
                              serialNo: ++serial,
                        },
                  }),
            });
            if (!res.ok) throw new Error(`webhook ${id}: ${res.status}`);
      },

      /** Uma passagem no terminal simulado da cantina (Lote 14). */
      async pass(id, method, { secondsAgo = 0 } = {}) {
            await this.webhook(id, method, this.terminal.doorNo, this.terminal.readerNo, new Date(this.now().getTime() - secondsAgo * 1000));
      },

      /** Uma passagem em qualquer ponto (PORT1, BIBLIO, ENFERM, REFEI1), em qualquer hora passada: `at` vai em
       *  dateTime. O backend aceita até 30 dias no passado e 5 min no futuro, e ignora a segunda passagem da mesma
       *  pessoa no mesmo ponto e sentido em menos de 30 s. */
      async passAt(id, method, { point, action = 'ENTRADA', at = this.now() }) {
            if (!(point in DOORS)) throw new Error(`unknown point ${point}`);
            if (!(action in READERS)) throw new Error(`unknown action ${action}`);
            const key = `${id} ${point} ${action}`;
            const previous = this.lastPass.get(key);
            if (previous !== undefined && Math.abs(at.getTime() - previous) <= 30_000) {
                  throw new Error(`${key}: two passes within 30 s, the second would be dropped`);
            }
            this.lastPass.set(key, at.getTime());
            await this.webhook(id, method, DOORS[point], READERS[action], at);
      },
      lastPass: new Map(),
};
