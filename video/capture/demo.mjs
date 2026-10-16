// O que seed.mjs e capture.mjs compartilham: a instância demo, os alunos fictícios e a API.
import { readFileSync } from 'node:fs';

const env = (name, fallback) => process.env[name] ?? fallback;

// Os alunos vêm só do arquivo de demo: os scripts nunca citam mais ninguém.
const csv = readFileSync(new URL('../../backend/src/test/resources/demo/eleves-demo.csv', import.meta.url), 'utf8');
const students = csv.trim().split('\n').slice(1).map((line) => {
      const [id, name, , turma] = line.split(';');
      return { id, name, turma };
});

const SCHOOL_ZONE = 'America/Sao_Paulo';

export const demo = {
      apiUrl: env('MAGBO_DEMO_API', 'http://localhost:8080'),
      frontend: env('MAGBO_DEMO_FRONTEND', 'http://localhost/'),
      backendContainer: 'magbo-demo-backend',
      schoolZone: SCHOOL_ZONE,
      students,
      classes: [...new Set(students.map((student) => student.turma))],
      // recusados explicitamente (NOT_AUTHORIZED); os outros ficam AUTHORIZED
      refused: ['9000002', '9000010'],
      // o terminal simulado da cantina; as portas 1 a 6 são os mapeamentos padrão da escola
      terminal: { doorNo: 9, readerNo: 1 },
      byId: (id) => students.find((student) => student.id === id),

      // o administrador padrão do perfil dev numa instância local nova
      admin: { username: env('MAGBO_DEMO_ADMIN', 'admin'), password: env('MAGBO_DEMO_ADMIN_PASSWORD', 'admin1234') },
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

      /** O dia (1 = segunda) e a hora da escola, arredondada para baixo em `roundMinutes`. */
      schoolNow(roundMinutes = 1) {
            const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
                  timeZone: SCHOOL_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
            }).formatToParts(new Date()).map((part) => [part.type, part.value]));
            const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
            const minute = Math.floor(Number(parts.minute) / roundMinutes) * roundMinutes;
            return { day, hour: `${parts.hour}:${String(minute).padStart(2, '0')}` };
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

      /** Uma passagem no terminal simulado da cantina, no formato de um AccessControllerEvent da Hikvision.
       *  subEventType 75 = rosto reconhecido, 1 = crachá reconhecido. */
      async pass(id, method, { secondsAgo = 0 } = {}) {
            const token = process.env.MAGBO_DEMO_WEBHOOK_TOKEN;
            if (!token) throw new Error('set MAGBO_DEMO_WEBHOOK_TOKEN to the token given to the demo backend');
            const when = new Date(Date.now() - secondsAgo * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
            const res = await fetch(`${this.apiUrl}/api/hikvision/webhook`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-MAGBO-WEBHOOK-TOKEN': token },
                  body: JSON.stringify({
                        dateTime: when,
                        AccessControllerEvent: {
                              employeeNoString: id,
                              majorEventType: 5,
                              subEventType: method === 'face' ? 75 : 1,
                              doorNo: this.terminal.doorNo,
                              readerNo: this.terminal.readerNo,
                              serialNo: Date.now(),
                        },
                  }),
            });
            if (!res.ok) throw new Error(`webhook ${id}: ${res.status}`);
      },
};
