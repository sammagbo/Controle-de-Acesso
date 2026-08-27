// =====================================================================
// AFFICHE CANTINE — le mur, imprimé depuis la configuration, EN COULEUR
// =====================================================================
// ⚠️ L'AFFICHE SORT DE LA CONFIG DU MOMENT. C'est tout l'intérêt : l'an
// prochain on change les créneaux à l'écran et on réimprime. Tant que le mur et
// la base étaient deux documents séparés, ils ont divergé — et c'est la
// divergence qui a produit 63 OUTSIDE_MEAL_TIME le 25/08/2026 sur des turmas
// qui mangeaient à l'heure juste.
//
// ⚠️⚠️ `print-color-adjust: exact` N'EST PAS DE LA DÉCORATION. Les navigateurs
// SUPPRIMENT les fonds colorés à l'impression par défaut — sans cette ligne
// (et son préfixe -webkit-), tout sort en gris, et c'est précisément pourquoi
// les réimpressions étaient ternes. Sam a réimprimé le mur le 27/08 et la
// consigne est : FIDÈLE et EN COULEUR. La première version de ce fichier
// imprimait volontairement en noir et blanc « pour les imprimantes N&B » —
// décision remplacée par celle de Sam.
//
// ⚠️ LE CODE COULEUR EST CELUI DU MUR, et il porte du sens : Terminale en
// saumon, 1ère et 2nde en bleu, collège en blanc à liseré gris. Un élève de
// 1ère retrouve sa couleur d'un jour à l'autre — changer la palette, c'est
// casser la lecture que toute l'école a déjà apprise.
//
// ⚠️ UNE PAGE PAR PASSAGE, EN PAYSAGE. `break-after` sépare 12H30 et 13H00 :
// ce sont deux affiches distinctes au mur. `@page landscape` parce que cinq
// jours tiennent côte à côte en paysage — comme sur le mur.
//
// ⚠️ AUCUNE BIBLIOTHÈQUE PDF. L'impression navigateur suffit (motif du print
// PPMS) : tout est masqué par `visibility`, seul le bloc d'impression reste.

/** La famille de couleur d'une turma — le code du MUR. */
function afficheCorDaTurma(turma) {
    const t = String(turma || '').toUpperCase();
    if (/^T\d/.test(t)) return 'terminale';          // T1, T2 — saumon
    if (/^[12]E/.test(t)) return 'lycee';            // 1E*, 2E* — bleu
    if (/^[3456]E/.test(t)) return 'college';        // 6E..3E — blanc, liseré gris
    return 'autre';                                  // élémentaire/maternelle (page 11h)
}

/** Styles inline : l'impression doit sortir EXACTEMENT ces couleurs. */
const AFFICHE_CORES = {
    terminale: { background: '#f9a8a0', border: '2px solid #dc2626', color: '#7f1d1d' },
    lycee:     { background: '#bfdbfe', border: '2px solid #1d4ed8', color: '#1e3a8a' },
    college:   { background: '#ffffff', border: '2px solid #94a3b8', color: '#0f172a' },
    autre:     { background: '#ffffff', border: '2px solid #94a3b8', color: '#0f172a' }
};

const AFFICHE_NAVY = '#1e3a5f';
const AFFICHE_VERMELHO = '#b91c1c';

function AfficheCantine({ grade, annee }) {
    const t = useI18n();

    const JOURS = [1, 2, 3, 4, 5];
    const creneaux = (grade && grade.creneaux) || [];

    // Les heures présentes, dans l'ordre d'affiche (ordem, puis heure). Les
    // 11h repris de class_schedules ont ordem=3 et ferment la marche.
    const heures = [...new Set(creneaux.filter(c => c.ativo !== false)
        .map(c => c.hora.slice(0, 5)))]
        .sort((a, b) => {
            const oa = Math.min(...creneaux.filter(c => c.hora.slice(0, 5) === a).map(c => c.ordem));
            const ob = Math.min(...creneaux.filter(c => c.hora.slice(0, 5) === b).map(c => c.ordem));
            return oa - ob || a.localeCompare(b);
        });

    const turmasDe = (dia, hora) => {
        const c = creneaux.find(x => x.diaSemana === dia && x.hora.slice(0, 5) === hora);
        return c ? c.turmas : [];
    };

    /**
     * Le bandeau-titre, dans les MOTS DU MUR pour les deux passages connus
     * (ordem 1 et 2) — et le rotulo de la base pour tout autre créneau : un
     * slot créé l'an prochain imprime son propre nom sans attendre une clé.
     */
    const bandeauDe = (hora) => {
        const c = creneaux.find(x => x.hora.slice(0, 5) === hora);
        const horaMur = hora.replace(':', 'H');
        if (c && c.ordem === 1) return t('affiche.cantine') + ' ' + horaMur + ' — ' + t('affiche.passage.1');
        if (c && c.ordem === 2) return t('affiche.cantine') + ' ' + horaMur + ' — ' + t('affiche.passage.2');
        // Fallback : le rotulo de la base, SANS l'heure qu'il répète souvent en
        // tête (« 11:00 — repris… » donnerait « CANTINE 11H00 — 11:00 — … »).
        const resto = (c && c.rotulo)
            ? c.rotulo.replace(/^\s*\d{1,2}[:hH]\d{2}\s*[—–-]?\s*/, '').trim() : '';
        return t('affiche.cantine') + ' ' + horaMur + (resto ? ' — ' + resto.toUpperCase() : '');
    };

    return (
        <div id="affiche-print">
            <style>{`
                /* ⚠️ Paysage : cinq jours côte à côte, comme au mur. */
                @page { size: A4 landscape; margin: 8mm; }
                @media print {
                    body * { visibility: hidden; }
                    #affiche-print, #affiche-print * { visibility: visible; }
                    #affiche-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .affiche-nao-imprime { display: none !important; }
                    /* ⚠️⚠️ LA ligne qui fait la couleur : sans elle le navigateur
                       jette les fonds à l'impression et tout sort en gris. */
                    #affiche-print, #affiche-print * {
                        print-color-adjust: exact !important;
                        -webkit-print-color-adjust: exact !important;
                    }
                    /* Une page par passage — ce sont deux affiches au mur. */
                    .affiche-passage { break-after: page; page-break-after: always; }
                    .affiche-passage:last-child { break-after: auto; page-break-after: auto; }
                    .affiche-jour { break-inside: avoid; page-break-inside: avoid; }
                }
            `}</style>

            {heures.map(hora => (
                <section key={hora} className="affiche-passage mb-10">
                    {/* ══ EN-TÊTE DU MUR : établissement à gauche, badge rouge à droite ══ */}
                    <header className="flex items-start justify-between mb-3">
                        <div>
                            <p className="text-2xl font-black leading-tight" style={{ color: AFFICHE_NAVY }}>
                                {t('affiche.lycee')}
                            </p>
                            <p className="text-sm font-bold tracking-[0.25em] text-slate-500 uppercase">
                                {t('affiche.cidade')}
                            </p>
                            <p className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase mt-0.5">
                                {t('affiche.vie.scolaire')}
                            </p>
                        </div>
                        <span className="text-white text-lg font-black px-4 py-2 rounded-lg"
                            style={{ background: AFFICHE_VERMELHO }}>
                            {t('affiche.badge')} {annee}
                        </span>
                    </header>

                    {/* ══ BANDEAU-TITRE : les mots du mur, CLASSES AUTORISÉES à droite ══ */}
                    <div className="flex items-center justify-between text-white px-4 py-2.5 rounded-lg mb-3"
                        style={{ background: AFFICHE_NAVY }}>
                        <p className="text-xl font-black tracking-wide">{bandeauDe(hora)}</p>
                        <p className="text-sm font-bold tracking-[0.15em] uppercase opacity-90">
                            {t('affiche.classes.autorisees')}
                        </p>
                    </div>

                    {/* ══ LES JOURS : blocs à bandeau bleu foncé, cinq colonnes ══ */}
                    <div className="grid grid-cols-5 gap-2">
                        {JOURS.map(d => {
                            const turmas = turmasDe(d, hora);
                            return (
                                <div key={d} className="affiche-jour rounded-lg overflow-hidden border"
                                    style={{ borderColor: AFFICHE_NAVY }}>
                                    <h2 className="text-sm font-black uppercase tracking-wide text-white text-center py-1.5"
                                        style={{ background: AFFICHE_NAVY }}>
                                        {t('creneaux.dia.' + d)}
                                    </h2>
                                    <div className="p-2 bg-white min-h-[70px]">
                                        {turmas.length === 0 ? (
                                            // ⚠️ « Aucune classe » écrit, jamais une case vide :
                                            // une case vide sur un mur se lit « oubli d'impression ».
                                            <p className="text-xs text-slate-400 italic">{t('affiche.sem.turma')}</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {turmas.map(tu => (
                                                    <span key={tu.turma}
                                                        className="text-sm font-black px-2.5 py-1 rounded-full"
                                                        style={{
                                                            ...AFFICHE_CORES[afficheCorDaTurma(tu.turma)],
                                                            ...(tu.aConfirmar ? { borderStyle: 'dashed' } : {})
                                                        }}>
                                                        {tu.turma}{tu.aConfirmar ? ' ?' : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ══ RAPPEL / AVISO — bilingue, repris du mur ══
                        ⚠️ Les familles lusophones lisent le mur aussi ; une règle
                        qui ne s'adresse qu'à une moitié de l'école n'est pas
                        affichée, elle est réservée. */}
                    <div className="mt-4 rounded-lg px-4 py-3 grid grid-cols-2 gap-4 border-2"
                        style={{ borderColor: AFFICHE_VERMELHO, background: '#fef2f2' }}>
                        <div>
                            <p className="text-xs font-black tracking-[0.2em] uppercase"
                                style={{ color: AFFICHE_VERMELHO }}>{t('affiche.rappel.titre')}</p>
                            <p className="text-sm font-bold mt-1" style={{ color: AFFICHE_NAVY }}>
                                {t('affiche.prioridade.fr')}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-black tracking-[0.2em] uppercase"
                                style={{ color: AFFICHE_VERMELHO }}>{t('affiche.aviso.titre')}</p>
                            <p className="text-sm font-bold mt-1" style={{ color: AFFICHE_NAVY }}>
                                {t('affiche.prioridade.pt')}
                            </p>
                        </div>
                    </div>

                    {/* ══ PIED DU MUR ══ */}
                    <footer className="mt-3 flex items-center justify-between text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                        <span>{t('affiche.pied.sfbe')}</span>
                        <span>{t('affiche.pied.aefe')}</span>
                    </footer>
                    <p className="text-[9px] text-slate-400 text-center mt-1">
                        {t('affiche.rodape')}
                    </p>
                </section>
            ))}
        </div>
    );
}
