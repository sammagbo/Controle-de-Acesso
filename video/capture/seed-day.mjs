// Prepara a instância demo local para o vídeo do dia inteiro (capture-day.mjs), pela própria API do sistema.
// Rodar uma vez, numa instância nova. Não cria nenhuma passagem: as das duas semanas antes vêm de seed-history.mjs,
// e as do dia entram durante a captura, cena a cena.
//
//   node seed-day.mjs
//
// Nunca apontar para uma instalação real: a sincronização Pronote desativa quem não está no arquivo.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { demo } from './demo.mjs';

const csv = fileURLToPath(new URL('../../backend/src/test/resources/demo/eleves-demo.csv', import.meta.url));
const token = await demo.login();
const summary = [];

// 1. Os 30 alunos, pela sincronização Pronote, como em seed.mjs: ela lê ./ftp_drop/export_pronote.csv dentro do
//    container e renomeia o arquivo depois de importar, por isso recebe uma cópia.
execFileSync('docker', ['exec', demo.backendContainer, 'mkdir', '-p', '/app/ftp_drop']);
execFileSync('docker', ['cp', csv, `${demo.backendContainer}:/app/ftp_drop/export_pronote.csv`]);
const report = await demo.api(token, 'POST', '/api/pronote/sync');
summary.push(`students: created ${report.created}, updated ${report.updated}, deactivated ${report.deactivated}, errors ${report.errors}`);
if (report.errors) throw new Error(`the import reported errors: ${JSON.stringify(report.errorMessages ?? report)}`);

// 2. Direitos à refeição: todos autorizados, menos Lina Exemple e Tom Exemple.
for (const student of demo.students) {
      const status = demo.refused.includes(student.id) ? 'NOT_AUTHORIZED' : 'AUTHORIZED';
      await demo.api(token, 'PUT', `/api/admin/meal-entitlements/${student.id}`, { status, note: 'Démo' });
}
summary.push(`meal rights: ${demo.students.length - demo.refused.length} authorized, ${demo.refused.length} not authorized (${demo.refused.join(', ')})`);

// 3. O créneau «Service midi», às 12:00, de segunda a sexta, para as três turmas: o do dia de captura e o dos dias
//    do histórico (seed-history.mjs). Sem créneau, cada refeição seria gravada também como «créneau non configuré».
for (let day = 1; day <= 5; day++) {
      const slot = await demo.api(token, 'POST', '/api/admin/meal-slots', { diaSemana: day, hora: '12:00', rotulo: 'Service midi', ordem: 1 });
      for (const turma of demo.classes) await demo.api(token, 'POST', `/api/admin/meal-slots/${slot.id}/turmas/${turma}`);
}
summary.push(`meal slot: «Service midi», Monday to Friday at 12:00 for ${demo.classes.join(', ')}`);

// 4. O nome que o administrador mostra no cabeçalho de todas as telas.
const users = await demo.api(token, 'GET', '/api/system-users');
const admin = users.find((user) => user.username === demo.admin.username);
if (!admin) throw new Error(`no system user named ${demo.admin.username}`);
await demo.api(token, 'PUT', `/api/system-users/${admin.id}`, { nomeCompleto: demo.adminName });
summary.push(`admin name: ${demo.admin.username} -> «${demo.adminName}»`);

// 5. A licença de demonstração, e o resumo.
await demo.assertLicenceValid(token);
for (const line of summary) console.log(line);
