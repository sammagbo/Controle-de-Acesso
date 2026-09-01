// =====================================================================
// LICENCE — le bandeau
// =====================================================================
// ⚠️ TON NEUTRE ET PROFESSIONNEL : ni menace, ni excuse. L'école n'a rien fait
// de mal, et rien n'est « bloqué » — des écrans d'administration sont
// suspendus pendant que tout le reste travaille. Le bandeau dit quatre
// choses : que la période est arrivée à son terme, que ce sont les fonctions
// de GESTION qui sont suspendues, que l'enregistrement des passages et la
// liste PPMS CONTINUENT, et à qui écrire pour renouveler.
//
// ⚠️ LA TROISIÈME EST LA PLUS IMPORTANTE et elle est écrite en toutes lettres,
// pas en petit : quelqu'un qui lit ce bandeau un mardi matin doit comprendre
// tout de suite que le registre et le PPMS fonctionnent encore. Sans cette
// phrase, un opérateur pourrait croire que le système est « éteint » et se
// mettre à noter les passages sur papier — c'est-à-dire perdre les données
// que le système est justement en train de continuer à enregistrer.
//
// Qui le voit vit dans js/utils/licence.js (module pur, testé).

function LicenceBanner({ licence, auth }) {
      const t = useI18n();
      const [replie, setReplie] = React.useState(false);

      const L = window.MagboLicence;
      if (!L || !L.montreBandeau(auth, licence)) return null;

      const ton = L.ton(licence);
      const restants = L.joursRestants(licence);
      const depassement = L.joursDepassement(licence);
      const cleMotif = L.cleMotif(licence);

      // ⚠️ Aucune des trois palettes n'est le rouge d'alerte du système : rien
      // de ce que dit ce bandeau ne met personne en danger, et emprunter la
      // couleur des vraies urgences la userait.
      const palette = {
            info: {
                  fond: 'bg-navy-50 border-navy-300',
                  titre: 'text-navy-800',
                  texte: 'text-navy-700',
                  icone: 'clock',
                  iconeCor: 'text-navy-500'
            },
            attention: {
                  fond: 'bg-warning-50 border-warning-400',
                  titre: 'text-warning-800',
                  texte: 'text-warning-700',
                  icone: 'alert-triangle',
                  iconeCor: 'text-warning-600'
            },
            suspendu: {
                  fond: 'bg-slate-100 border-slate-400',
                  titre: 'text-slate-800',
                  texte: 'text-slate-700',
                  icone: 'lock',
                  iconeCor: 'text-slate-600'
            }
      }[ton] || null;

      if (!palette) return null;

      const titre = ton === 'info'
            ? t('licence.alerte.titre', { jours: restants == null ? '?' : restants })
            : ton === 'attention'
                  ? t('licence.courtoisie.titre', { jours: depassement == null ? '?' : depassement })
                  : t('licence.expiree.titre');

      const corps = ton === 'info'
            ? t('licence.alerte.texte')
            : ton === 'attention'
                  ? t('licence.courtoisie.texte')
                  : t('licence.expiree.texte');

      return (
            <div className={`border-b ${palette.fond} px-4 py-3`} role="status">
                  <div className="max-w-7xl mx-auto flex items-start gap-3">
                        <i data-lucide={palette.icone}
                           className={`w-5 h-5 mt-0.5 shrink-0 ${palette.iconeCor}`}></i>

                        <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${palette.titre}`}>{titre}</p>

                              {!replie && (
                                    <div className={`mt-1 text-sm space-y-1 ${palette.texte}`}>
                                          <p>{corps}</p>

                                          {/* ⚠️ CE QUI CONTINUE — jamais masqué derrière le
                                              repli, et toujours au-dessus du contact : c'est
                                              la phrase qui empêche quelqu'un de croire que le
                                              système est éteint. */}
                                          {ton !== 'info' && (
                                                <p className="font-medium">{t('licence.continue')}</p>
                                          )}

                                          {cleMotif && ton === 'suspendu' && (
                                                <p className="text-xs opacity-90">{t(cleMotif)}</p>
                                          )}

                                          <p className="text-xs">
                                                {t('licence.contact')}{' '}
                                                <span className="font-mono">
                                                      {licence.contact || 'sammagbo@gmail.com'}
                                                </span>
                                          </p>

                                          {licence.expireLe && (
                                                <p className="text-xs opacity-75">
                                                      {t('licence.echeance', { date: licence.expireLe })}
                                                </p>
                                          )}
                                    </div>
                              )}
                        </div>

                        {/* Repliable, jamais fermable définitivement : un bandeau qu'on
                            peut faire disparaître pour de bon est un bandeau que
                            personne ne relira le jour où il compte. Le titre — donc
                            le décompte — reste toujours visible. */}
                        <button
                              onClick={() => setReplie(v => !v)}
                              className={`shrink-0 text-xs underline ${palette.texte} hover:opacity-70`}
                              title={replie ? t('licence.deplier') : t('licence.replier')}>
                              {replie ? t('licence.deplier') : t('licence.replier')}
                        </button>
                  </div>
            </div>
      );
}
