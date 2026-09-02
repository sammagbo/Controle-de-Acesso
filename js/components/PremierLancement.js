// =====================================================================
// PREMIÈRE CONFIGURATION DU POSTE
// =====================================================================
// L'écran que l'on voit UNE FOIS, à la première ouverture du .exe sur un PC
// neuf. Ensuite, plus jamais : le réglage est écrit à côté du .exe et relu à
// chaque ouverture.
//
// ⚠️ IL NE S'AFFICHE JAMAIS SUR UN POSTE DÉJÀ INSTALLÉ. Quand
// `Abrir-MAGBO.bat` pose `MAGBO_API_URL` / `MAGBO_SECTOR`, la résolution
// s'arrête à l'environnement et `doitConfigurer` est faux — voir
// `js/utils/posteConfig.js`. Un poste du parc, non touché, ne voit pas cet
// écran et se comporte exactement comme avant.
//
// ⚠️ LE BOUTON D'ENREGISTREMENT RESTE FERMÉ TANT QUE LA CONNEXION N'A PAS
// RÉPONDU. C'est la demande centrale : personne ne doit pouvoir enregistrer
// une configuration qui ne marche pas sans le savoir. Un poste enregistré sur
// une mauvaise adresse s'ouvre tous les matins sur un écran vide, et la
// personne devant lui n'a aucun moyen de deviner que c'est l'adresse.

/** Au-delà, on n'attend plus : une adresse fausse peut bloquer très longtemps. */
const DELAI_TEST_MS = 6000;

function PremierLancement({ configInitiale, onTermine, onAnnuler, onQuitter, mode }) {
      const t = useI18n();

      const PC = window.MagboPosteConfig;
      const postes = React.useMemo(
            () => (PC ? PC.postesDisponibles(typeof ACCESS_POINTS !== 'undefined' ? ACCESS_POINTS : []) : []),
            []);

      const [adresse, setAdresse] = React.useState(
            (configInitiale && configInitiale.apiUrl) || (PC && PC.DEFAUT_API_URL) || '');
      const [poste, setPoste] = React.useState((configInitiale && configInitiale.sector) || '');

      // `null` = pas encore testé · sinon { ok, cleMessage, detail }
      const [essai, setEssai] = React.useState(null);
      const [enCours, setEnCours] = React.useState(false);
      const [enregistrement, setEnregistrement] = React.useState(null);

      // ⚠️ LA CIBLE DU TEST EN VOL. Sans cette référence, une réponse arrivée en
      // retard s'appliquait à l'adresse COURANTE : on testait la bonne adresse,
      // on en tapait une fausse pendant les six secondes, la réponse verte
      // arrivait — et le bouton s'ouvrait sur une adresse JAMAIS testée. C'est
      // exactement ce que cet écran existe pour empêcher.
      // (Panel de revue — qualité, 02/09/2026.)
      const cible = React.useRef(adresse);
      React.useEffect(() => { cible.current = adresse; }, [adresse]);

      // ⚠️ Le test en vol est abandonné au démontage : depuis l'ajout du bouton
      // « Annuler », l'écran peut disparaître pendant les six secondes.
      const avorteur = React.useRef(null);
      React.useEffect(() => () => { if (avorteur.current) avorteur.current.abort(); }, []);

      // ⚠️ Le réglage vient-il d'un `.bat` ? Alors enregistrer ne servirait à
      // rien : les variables d'environnement priment et reposeraient l'ancienne
      // valeur à la prochaine ouverture. On le dit AVANT, pas après six
      // secondes de test et un clic. (Panel de revue — Vie Scolaire.)
      const gouvernParEnv = !!(PC && configInitiale
            && configInitiale.source === PC.SOURCES.ENVIRONNEMENT);

      // ⚠️ Toute modification INVALIDE le test précédent. Sans cela, on teste
      // une adresse, on en tape une autre, et le bouton reste ouvert sur la
      // foi d'un essai qui ne concerne plus rien.
      const changerAdresse = (v) => { setAdresse(v); setEssai(null); setEnregistrement(null); };

      const erreurUrl = PC ? PC.verifierUrl(adresse) : null;
      const peutTester = !erreurUrl && !enCours;
      const peutEnregistrer = !!essai && essai.ok && !!poste && !enCours && !gouvernParEnv;

      /**
       * Le test de connexion.
       *
       * ⚠️ ON INTERROGE `/api/health`, et pas la racine : c'est la seule route
       * publique qui répond sans jeton ET qui dit que l'on parle bien à un
       * MAGBO. Une adresse qui répond « 200 » peut être n'importe quel serveur
       * du réseau de l'école ; sans cette vérification, on enregistrerait
       * l'imprimante.
       */
      const tester = React.useCallback(async () => {
            setEnCours(true);
            setEssai(null);
            setEnregistrement(null);
            const vise = adresse;                 // la cible de CE test
            const base = PC.normaliserUrl(vise);
            const ctrl = new AbortController();
            avorteur.current = ctrl;
            const minuteur = setTimeout(() => ctrl.abort(), DELAI_TEST_MS);
            /** N'écrit l'état que si l'adresse n'a pas changé entre-temps. */
            const poser = (etat) => { if (cible.current === vise) setEssai(etat); };
            try {
                  const res = await fetch(`${base}/api/health`, { signal: ctrl.signal });
                  if (!res.ok) {
                        poser({ ok: false, cleMessage: 'poste.test.repond.mal', detail: `HTTP ${res.status}` });
                        return;
                  }
                  const corps = await res.json();
                  if (!corps || typeof corps.service !== 'string' || !corps.service.includes('MAGBO')) {
                        poser({ ok: false, cleMessage: 'poste.test.pas.magbo' });
                        return;
                  }
                  // ⚠️ Base injoignable côté serveur : on PRÉVIENT mais on
                  // n'interdit pas. L'adresse est bonne — c'est le serveur qui a
                  // un problème, et empêcher d'enregistrer obligerait à revenir
                  // configurer le poste une fois la base réparée.
                  poser({
                        ok: true,
                        cleMessage: corps.database === 'CONNECTED'
                              ? 'poste.test.ok' : 'poste.test.ok.base',
                        detail: null
                  });
            } catch (e) {
                  poser({
                        ok: false,
                        cleMessage: e && e.name === 'AbortError'
                              ? 'poste.test.delai' : 'poste.test.injoignable'
                  });
            } finally {
                  clearTimeout(minuteur);
                  avorteur.current = null;
                  setEnCours(false);
            }
      }, [adresse, PC]);

      const enregistrer = React.useCallback(async () => {
            setEnCours(true);
            try {
                  const r = await window.magboConfig.enregistrerPoste({ apiUrl: PC.normaliserUrl(adresse), sector: poste });
                  if (r && r.ok) {
                        onTermine(r.config);
                        return;
                  }
                  setEnregistrement(r || { ok: false, motif: 'ecriture' });
            } catch (e) {
                  setEnregistrement({ ok: false, motif: 'ecriture', detail: String(e && e.message) });
            } finally {
                  setEnCours(false);
            }
      }, [adresse, poste, PC, onTermine]);

      const correction = mode === 'correction';

      return (
            <div className="min-h-screen bg-soft-100 flex items-center justify-center p-6">
                  <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

                        <div className="bg-navy-500 px-6 py-5 text-white">
                              <h1 className="text-xl font-bold">
                                    {correction ? t('poste.titre.correction') : t('poste.titre')}
                              </h1>
                              <p className="text-sm text-navy-100 mt-1">
                                    {correction ? t('poste.sous.correction') : t('poste.sous')}
                              </p>
                        </div>

                        <div className="p-6 space-y-6">

                              {/* ⚠️ D'OÙ VIENT LE RÉGLAGE ACTUEL — dit AVANT, pas après.
                                  Sans ce bandeau, un administrateur au portail remplissait
                                  le formulaire, attendait six secondes de test, cliquait,
                                  et n'apprenait qu'alors qu'un `.bat` gouverne le poste et
                                  que rien ne sera enregistré. Les phrases existaient déjà
                                  dans les deux dictionnaires et n'étaient utilisées nulle
                                  part. (Panel de revue — Vie Scolaire, 02/09/2026.) */}
                              {correction && configInitiale && configInitiale.source && (
                                    <div className={`rounded-lg px-3 py-2 text-sm border ${
                                          gouvernParEnv
                                                ? 'bg-warning-50 border-warning-500 text-warning-600'
                                                : 'bg-slate-50 border-slate-300 text-slate-700'}`}>
                                          <p className="font-medium">
                                                {t('poste.actuel.source.' + configInitiale.source)}
                                          </p>
                                          {/* ⚠️ LE CHEMIN S'AFFICHE AUSSI QUAND UN `.bat`
                                              GOUVERNE — c'est-à-dire pendant toute
                                              migration, le seul moment où quelqu'un a
                                              besoin de savoir où le réglage ira. Le
                                              masquer là privait de l'information la
                                              personne qui la cherchait.
                                              (Panel de revue — opérateur, 2e tour.) */}
                                          {configInitiale.cheminFichier && (
                                                <p className="text-xs opacity-80 mt-1 font-mono break-all">
                                                      {t('poste.actuel.fichier')} : {configInitiale.cheminFichier}
                                                      {gouvernParEnv && ' ' + t('poste.actuel.fichier.inutilise')}
                                                </p>
                                          )}
                                          {gouvernParEnv && (
                                                <p className="text-xs mt-1">{t('poste.err.environnement')}</p>
                                          )}
                                    </div>
                              )}

                              {/* ── L'adresse du serveur ── */}
                              <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1"
                                           htmlFor="poste-adresse">
                                          {t('poste.adresse')}
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">{t('poste.adresse.aide')}</p>
                                    <input
                                          id="poste-adresse"
                                          type="text"
                                          value={adresse}
                                          onChange={(e) => changerAdresse(e.target.value)}
                                          disabled={enCours || gouvernParEnv}
                                          spellCheck={false}
                                          autoComplete="off"
                                          className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm
                                                     focus:ring-2 focus:ring-navy-300 focus:border-navy-400"
                                    />
                                    {erreurUrl && adresse.trim() !== '' && (
                                          <p className="mt-1 text-xs text-warning-600">{t(erreurUrl)}</p>
                                    )}
                              </div>

                              {/* ── Le poste ── */}
                              <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1"
                                           htmlFor="poste-choix">
                                          {t('poste.poste')}
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2">{t('poste.poste.aide')}</p>
                                    <select
                                          id="poste-choix"
                                          value={poste}
                                          onChange={(e) => setPoste(e.target.value)}
                                          disabled={enCours || gouvernParEnv}
                                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white
                                                     focus:ring-2 focus:ring-navy-300 focus:border-navy-400">
                                          <option value="">{t('poste.poste.choisir')}</option>
                                          {postes.map(p => (
                                                <option key={p.id} value={p.id}>
                                                      {p.cleI18n ? t(p.cleI18n) : p.nom}
                                                </option>
                                          ))}
                                    </select>
                                    {/* ⚠️ DIT CE QUE CE CHOIX NE FAIT PAS. C'est tout
                                        l'objet de cette entrée : lever le doute sur une
                                        machine qui n'enregistre aucun passage. Sans cette
                                        ligne, « Poste administratif » se lit comme un lieu
                                        de plus. */}
                                    {PC && PC.estAdministratif(poste) && (
                                          <p className="mt-2 text-xs text-slate-500">
                                                {t('poste.administratif.note')}
                                          </p>
                                    )}
                              </div>

                              {/* ⚠️ Le rechargement DÉCONNECTE : le jeton vit en mémoire.
                                  On le dit avant, pas après. */}
                              {correction && !gouvernParEnv && (
                                    <p className="text-xs text-slate-500 italic">
                                          {t('poste.rechargement')}
                                    </p>
                              )}

                              {/* ── Le test ── */}
                              <div className="border-t border-slate-200 pt-5">
                                    <button
                                          type="button"
                                          onClick={tester}
                                          disabled={!peutTester}
                                          className="px-4 py-2 rounded-lg text-sm font-semibold border
                                                     border-navy-300 text-navy-700 hover:bg-navy-50
                                                     disabled:opacity-40 disabled:cursor-not-allowed">
                                          {enCours ? t('poste.test.encours') : t('poste.test.bouton')}
                                    </button>

                                    {essai && (
                                          <div className={`mt-3 rounded-lg px-3 py-2 text-sm border ${
                                                essai.ok
                                                      ? 'bg-success-50 border-success-500 text-success-600'
                                                      : 'bg-warning-50 border-warning-500 text-warning-600'}`}>
                                                <p className="font-medium">{t(essai.cleMessage)}</p>
                                                {essai.detail && (
                                                      <p className="text-xs opacity-80 mt-0.5 font-mono">{essai.detail}</p>
                                                )}
                                                {!essai.ok && (
                                                      <p className="text-xs mt-1">{t('poste.test.quoi.faire')}</p>
                                                )}
                                                {/* ⚠️ Le vert ne dit plus « la configuration peut
                                                    être enregistrée » : il s'affichait AVANT le choix
                                                    du poste, pendant que le bouton restait gris, et
                                                    la personne cliquait sur un bouton mort. Le pied
                                                    de page dit ce qui manque encore. */}
                                          </div>
                                    )}

                                    {!essai && (
                                          <p className="mt-2 text-xs text-slate-500">{t('poste.test.obligatoire')}</p>
                                    )}
                              </div>

                              {/* ── L'échec d'enregistrement ── */}
                              {enregistrement && !enregistrement.ok && (
                                    <div className="rounded-lg px-3 py-2 text-sm border bg-warning-50
                                                    border-warning-500 text-warning-600">
                                          <p className="font-medium">
                                                {enregistrement.motif === 'environnement'
                                                      ? t('poste.err.environnement')
                                                      : t('poste.err.ecriture')}
                                          </p>
                                          {enregistrement.chemin && (
                                                <p className="text-xs opacity-80 mt-1 font-mono break-all">
                                                      {enregistrement.chemin}
                                                </p>
                                          )}
                                          {/* ⚠️ Le message de l'OS — ENOSPC, EPERM, EROFS.
                                              Il était renvoyé par le processus principal et
                                              jamais affiché : sur un disque plein, l'écran
                                              nommait la seule cause qui n'était pas la
                                              bonne. (Panel de revue — qualité, 2e tour.) */}
                                          {enregistrement.detail && (
                                                <p className="text-xs opacity-70 mt-1 font-mono break-all">
                                                      {enregistrement.detail}
                                                </p>
                                          )}
                                    </div>
                              )}
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                              {/* ⚠️ NOMMER CE QUI MANQUE, pas répéter les consignes. Un
                                  « Choisissez un poste et testez la connexion » alors que
                                  le poste EST choisi laisse chercher lequel des deux. */}
                              <p className="text-xs text-slate-500">
                                    {gouvernParEnv ? t('poste.pas.pret.env')
                                          : !poste ? t('poste.pas.pret.poste')
                                          : !essai || !essai.ok ? t('poste.pas.pret.test')
                                          : t('poste.pret')}
                              </p>
                              <div className="flex items-center gap-2 shrink-0">
                                    {/* ⚠️★★ SANS CE BOUTON, L'ÉCRAN DE CORRECTION EST UN PIÈGE.
                                        `corrigerPoste` ne redevenait faux qu'après un
                                        enregistrement RÉUSSI : un administrateur qui ouvrait
                                        Engrenage → Poste sur un poste gouverné par un `.bat`
                                        — le cas le plus fréquent du parc — ne pouvait plus
                                        revenir à l'application. En mode quiosque, Alt+F4 est
                                        bloqué : il fallait tuer le processus.
                                        (Panel de revue — opérateur ET qualité, 02/09/2026.) */}
                                    {/* ⚠️★★ EN MODE PREMIER, LA SEULE ISSUE.
                                        Cet écran n'a pas d'« Annuler » : il n'y a rien
                                        derrière lui. Mais il existe un état où il
                                        s'affiche ET où l'enregistrement sera refusé pour
                                        toujours — le canal de configuration muet sur un
                                        poste que des variables gouvernent : la page croit
                                        devoir configurer, le processus principal sait que
                                        non, et il a créé la fenêtre EN QUIOSQUE. Plutôt
                                        que d'énumérer ces états, on donne une sortie.
                                        (Panel de revue — qualité, 2e tour, 02/09/2026.) */}
                                    {!correction && onQuitter && (
                                          <button
                                                type="button"
                                                onClick={onQuitter}
                                                className="px-4 py-2 rounded-lg text-sm font-semibold
                                                           border border-slate-300 text-slate-700 hover:bg-white">
                                                {t('poste.quitter')}
                                          </button>
                                    )}
                                    {correction && (
                                          <button
                                                type="button"
                                                onClick={onAnnuler}
                                                className="px-4 py-2 rounded-lg text-sm font-semibold
                                                           border border-slate-300 text-slate-700 hover:bg-white">
                                                {t('poste.annuler')}
                                          </button>
                                    )}
                                    <button
                                          type="button"
                                          onClick={enregistrer}
                                          disabled={!peutEnregistrer}
                                          className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-navy-500
                                                     hover:bg-navy-600 disabled:opacity-40 disabled:cursor-not-allowed">
                                          {t('poste.enregistrer')}
                                    </button>
                              </div>
                        </div>
                  </div>
            </div>
      );
}
