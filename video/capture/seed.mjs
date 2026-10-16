// Cadastra na instância demo local (docker compose -p magbo-demo) os alunos fictícios de
// backend/src/test/resources/demo/, pela própria API do sistema. Rodar uma vez, numa instância nova.
//
//   node seed.mjs
//
// Nunca apontar para uma instalação real: a sincronização Pronote desativa quem não está no arquivo.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { demo } from './demo.mjs';

const csv = fileURLToPath(new URL('../../backend/src/test/resources/demo/eleves-demo.csv', import.meta.url));

const token = await demo.login();
await demo.assertLicenceValid(token);

// 1. Os alunos, pela sincronização Pronote: ela lê ./ftp_drop/export_pronote.csv dentro do container do
//    backend e renomeia o arquivo depois de importar, por isso recebe uma cópia, nunca o arquivo do repositório.
execFileSync('docker', ['exec', demo.backendContainer, 'mkdir', '-p', '/app/ftp_drop']);
execFileSync('docker', ['cp', csv, `${demo.backendContainer}:/app/ftp_drop/export_pronote.csv`]);
const report = await demo.api(token, 'POST', '/api/pronote/sync');
console.log(`pronote sync: created ${report.created}, updated ${report.updated}, deactivated ${report.deactivated}, errors ${report.errors}`);
if (report.errors) throw new Error(`the import reported errors: ${JSON.stringify(report.errorMessages ?? report)}`);

// 2. Direitos à refeição: todos autorizados, menos os dois alunos recusados explicitamente.
//    PENDING não serve: por padrão, meal-pending=OBSERVATION grava a passagem mesmo assim.
for (const student of demo.students) {
      const status = demo.refused.includes(student.id) ? 'NOT_AUTHORIZED' : 'AUTHORIZED';
      await demo.api(token, 'PUT', `/api/admin/meal-entitlements/${student.id}`, { status, note: 'Démo' });
}
console.log(`meal rights: ${demo.students.length - demo.refused.length} authorized, ${demo.refused.length} not authorized (${demo.refused.join(', ')})`);

// 3. Um créneau de refeição para as três turmas, hoje, na hora atual da escola (capture.mjs abre outro se
//    rodar mais tarde): sem ele, cada passagem também é gravada como «créneau non configuré».
console.log(`meal slot: ${await demo.openMealService(token)}`);

// 4. O terminal simulado: uma porta que os mapeamentos padrão da escola não usam, ligada à entrada da
//    cantina, sem endereço de terminal nenhum.
await demo.api(token, 'POST', '/api/admin/door-mappings', {
      terminalIp: null, doorNo: demo.terminal.doorNo, readerNo: demo.terminal.readerNo,
      pointId: 'REFEI1', action: 'ENTRADA', label: 'Cantine — terminal démo', ativo: true,
});
console.log(`door mapping: door ${demo.terminal.doorNo} / reader ${demo.terminal.readerNo} -> REFEI1, ENTRADA`);
