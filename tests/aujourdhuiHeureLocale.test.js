// =====================================================================
// GARDE — « aujourd'hui » se calcule en HEURE LOCALE, jamais en UTC
// =====================================================================
// Le quatrième défaut d'horloge du projet, trouvé par le balayage du 28/08 :
// vingt sites faisaient `new Date().toISOString().slice(0, 10)` pour obtenir
// « la date du jour ». `toISOString()` est en UTC. Rio est à UTC−3 : à partir
// de 21 h, cette expression rend DEMAIN. Le compteur « Mouvements aujourd'hui »
// de l'accueil tombait à 0, les rapports Infirmerie / Cantine / Général
// interrogeaient un jour qui n'existait pas encore, et le Moniteur Cantine
// demandait les passages du lendemain. Un défaut qui ne se voit qu'après 21 h,
// c'est-à-dire jamais pendant une démonstration.
//
// Le remède est `dayKey(date)` de js/utils/helpers.js — composantes LOCALES —
// et ce test interdit la forme UTC partout où elle nomme un jour.
//
// ⚠️ Un nom de FICHIER téléchargé (`cdi_backup_2026-08-28.json`) n'est pas un
// jour interrogé : il est listé ici comme exception NOMMÉE. Apagar uma
// entrada daqui é escrever a correção, nunca afrouxar o teste.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '..');

/** Sites où la forme UTC nomme un FICHIER, pas un jour — tolérés, nommés. */
const NOMS_DE_FICHIER = [
    'js/api.js',                        // magbo-hikcentral-<date>.csv
    'js/cdi/HistoryModal.js',           // cdi_<date>.csv
];

function listar(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'libs') out.push(...listar(p)); }
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

describe("« aujourd'hui » en heure locale", () => {

    it('★★★ le remède existe : dayKey rend la date LOCALE, pas UTC', () => {
        // 22 h 30 à Rio le 28/08 = 01 h 30 UTC le 29/08. toISOString dit 29,
        // dayKey doit dire 28. On simule Rio en construisant la date en local :
        // ce test tourne sur un poste réglé sur America/Sao_Paulo (le PC du
        // projet, la VM). Sur un poste en UTC les deux valeurs coïncident et
        // l'assertion de DIVERGENCE est sautée — mais celle de dayKey tient.
        const src = fs.readFileSync(path.join(REPO, 'js/utils/helpers.js'), 'utf8');
        const m = src.match(/function dayKey\(date\) \{[\s\S]*?\n\}/);
        expect(m, 'dayKey a disparu de helpers.js').toBeTruthy();
        // eslint-disable-next-line no-new-func
        const dayKey = new Function('safeDateParse', m[0] + '; return dayKey;')(x => x);

        const tard = new Date(2026, 7, 28, 22, 30, 0);   // 28/08/2026 22:30 LOCAL
        expect(dayKey(tard)).toBe('2026-08-28');
        if (tard.getTimezoneOffset() > 0) {
            // poste à l'ouest de Greenwich (Rio) : la forme UTC ment
            expect(tard.toISOString().slice(0, 10)).toBe('2026-08-29');
        }
    });

    it("★★★ aucun composant ne calcule un JOUR avec toISOString().slice(0, 10)", () => {
        const arquivos = listar(path.join(REPO, 'js'));
        const infratores = [];
        for (const f of arquivos) {
            const rel = path.relative(REPO, f).replace(/\\/g, '/');
            if (NOMS_DE_FICHIER.includes(rel)) continue;
            const linhas = fs.readFileSync(f, 'utf8').split('\n');
            linhas.forEach((l, i) => {
                if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;   // un commentaire qui CITE la forme n'est pas un site
                if (/toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|substring\(0,\s*10\)|split\('T'\)\[0\])/.test(l)) {
                    infratores.push(`${rel}:${i + 1}`);
                }
            });
        }
        expect(infratores,
            "Ces lignes nomment un jour en UTC. À Rio, après 21 h, c'est DEMAIN : "
            + 'remplacer par dayKey(new Date()) / dayKey(d) (js/utils/helpers.js). '
            + "Un nom de fichier téléchargé peut rester en UTC — mais alors il est listé dans NOMS_DE_FICHIER.")
            .toEqual([]);
    });
});
