// =====================================================================
// AFFICHE CANTINE — le mur, imprimé depuis la configuration
// =====================================================================
// ⚠️ L'AFFICHE SORT DE LA CONFIG DU MOMENT. C'est tout l'intérêt : l'an
// prochain on change les créneaux à l'écran et on réimprime. Tant que le mur et
// la base étaient deux documents séparés, ils ont divergé — et c'est la
// divergence qui a produit 63 OUTSIDE_MEAL_TIME le 25/08/2026 sur des turmas
// qui mangeaient à l'heure juste.
//
// ⚠️ AUCUNE BIBLIOTHÈQUE PDF. L'impression navigateur suffit et suit le motif
// déjà en place (le print du PPMS) : tout est masqué par `visibility`, et seul
// le bloc d'impression reste visible. On ne monte RIEN par JS avant
// `window.print()` — le dialogue s'ouvre avant que React ait repeint, et ce qui
// n'a pas été rendu, l'impression ne l'invente pas.
//
// ⚠️ UNE PAGE PAR PASSAGE. `break-after` sépare 12H30 et 13H00 : ce sont deux
// affiches distinctes au mur, et les imprimer en continu obligerait quelqu'un à
// les découper aux ciseaux.

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

    const rotuloDe = (hora) => {
        const c = creneaux.find(x => x.hora.slice(0, 5) === hora);
        return (c && c.rotulo) || hora;
    };

    return (
        <div id="affiche-print">
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #affiche-print, #affiche-print * { visibility: visible; }
                    #affiche-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .affiche-nao-imprime { display: none !important; }
                    /* Une page par passage — ce sont deux affiches au mur. */
                    .affiche-passage { break-after: page; page-break-after: always; }
                    .affiche-passage:last-child { break-after: auto; page-break-after: auto; }
                    .affiche-jour { break-inside: avoid; page-break-inside: avoid; }
                    /* ⚠️ Les pastilles doivent rester lisibles en noir et blanc :
                       la plupart des imprimantes de l'école le sont. Contour au
                       lieu de fond coloré. */
                    .affiche-turma { border: 1px solid #334155 !important; background: #fff !important;
                                     color: #0f172a !important; }
                    .affiche-a-confirmar { border-style: dashed !important; }
                }
            `}</style>

            {heures.map(hora => (
                <section key={hora} className="affiche-passage mb-10">
                    {/* En-tête, comme sur le mur */}
                    <header className="text-center mb-5 pb-3 border-b-2 border-navy-500">
                        <p className="text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">
                            {t('affiche.etablissement')}
                        </p>
                        <h1 className="text-3xl font-black text-navy-500 mt-1">
                            {t('affiche.titulo')} {annee}
                        </h1>
                        <p className="text-lg font-bold text-navy-500 mt-2">{rotuloDe(hora)}</p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {JOURS.map(d => {
                            const turmas = turmasDe(d, hora);
                            return (
                                <div key={d} className="affiche-jour border border-soft-200 rounded-xl p-3">
                                    <h2 className="text-sm font-black uppercase tracking-wide text-navy-500 mb-2">
                                        {t('creneaux.dia.' + d)}
                                    </h2>
                                    {turmas.length === 0 ? (
                                        // ⚠️ « Aucune classe » écrit, jamais une case vide : une
                                        // case vide sur un mur se lit « on a oublié d'imprimer ».
                                        <p className="text-xs text-slate-400 italic">{t('affiche.sem.turma')}</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {turmas.map(tu => (
                                                <span key={tu.turma}
                                                    className={`affiche-turma text-sm font-bold px-2.5 py-1 rounded-full border ${
                                                        tu.aConfirmar
                                                            ? 'affiche-a-confirmar bg-warning-50 text-warning-700 border-warning-500/50'
                                                            : 'bg-white text-navy-500 border-soft-300'}`}>
                                                    {tu.turma}{tu.aConfirmar ? ' ?' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* ⚠️ La règle de priorité, BILINGUE et reprise telle quelle.
                        Les familles lusophones lisent le mur aussi ; une règle
                        qui ne s'adresse qu'à une moitié de l'école n'est pas
                        affichée, elle est réservée. */}
                    <div className="mt-5 border-2 border-navy-500 rounded-xl px-4 py-3 text-center">
                        <p className="text-sm font-bold text-navy-500">{t('affiche.prioridade.fr')}</p>
                        <p className="text-sm text-slate-600 mt-1">{t('affiche.prioridade.pt')}</p>
                    </div>

                    <p className="text-[10px] text-slate-400 text-center mt-3">
                        {t('affiche.rodape')}
                    </p>
                </section>
            ))}
        </div>
    );
}
