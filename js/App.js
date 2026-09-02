// =====================================================================
// MAIN APP
// =====================================================================

/** Cadência da recarga periódica da visão de setor (mesma do CantineMonitor). */
const SECTOR_POLL_MS = 3000;

/**
 * Pontos que renderizam <SectorView> — os únicos que consomem `accessLogs`.
 * Os de category 'monitor' e o CDI têm telas próprias que buscam os próprios
 * dados, então não devem gerar polling de /access/logs/{pointId}.
 */
function rendersSectorView(point) {
      return !!point && point.category !== 'monitor' && point.id !== 'BIBLIO';
}

function App() {
      const t = useI18n();

      /**
       * La configuration du poste, telle que le processus principal l'a
       * résolue (environnement → fichier → à demander).
       *
       * ⚠️ LUE DE FAÇON SYNCHRONE : `getCached()` n'est plus jamais `null`
       * depuis que le preload la lit par `sendSync`. Un `useState` avec une
       * valeur initiale suffit donc — pas d'effet, pas de rendu intermédiaire
       * pendant lequel l'application partirait sur localhost.
       */
      const [poste, setPoste] = React.useState(() => {
            // ⚠️ LA RÈGLE VIT DANS LE MODULE PARTAGÉ (`resoudreDuPont`), où la
            // suite l'exécute : écrite ici, elle pouvait être inversée d'un
            // mot sans qu'aucun des 787 tests ne rougisse — mesuré au 2e tour.
            if (window.MagboPosteConfig) {
                  return window.MagboPosteConfig.resoudreDuPont(
                        !!window.magboConfig,
                        window.magboConfig && window.magboConfig.getCached
                              && window.magboConfig.getCached());
            }
            const pont = window.magboConfig && window.magboConfig.getCached
                  && window.magboConfig.getCached();
            if (pont) return pont;
            // ⚠️ LE PONT EXISTE MAIS N'A RIEN RENDU (canal muet, versions
            // dépareillées) : on DEMANDE plutôt que de partir sur une adresse
            // devinée. Le repli inverse — `doitConfigurer: false` — sautait
            // l'écran sur un PC neuf et affichait une connexion qui ne pouvait
            // pas aboutir : le symptôme même que ce chantier supprime.
            // (Panel de revue — qualité, 02/09/2026.)
            //
            // ⚠️ Hors Electron (page ouverte dans un navigateur, tests), il n'y
            // a pas de pont du tout : là, ne rien demander est correct.
            if (window.magboConfig) return { doitConfigurer: true };
            return { doitConfigurer: false };
      });

      // ⚠️ LE RATTRAPAGE, quand le canal synchrone n'a rien rendu. `preload.js`
      // repasse alors par la voie asynchrone et émet `magbo-config-prete` —
      // sans cet écouteur, le rattrapage ne rattrapait que le cache DU
      // PRELOAD, et l'écran de première configuration restait affiché sur un
      // poste correctement réglé. (Panel de revue — qualité, 2e tour.)
      React.useEffect(() => {
            const relire = () => {
                  const c = window.magboConfig && window.magboConfig.getCached
                        && window.magboConfig.getCached();
                  if (c) setPoste(c);
            };
            window.addEventListener('magbo-config-prete', relire);
            return () => window.removeEventListener('magbo-config-prete', relire);
      }, []);

      // L'engrenage demande la correction du réglage (onglet Poste, derrière
      // CONFIG_WRITE — voir AppSettingsModal).
      const [corrigerPoste, setCorrigerPoste] = React.useState(false);
      React.useEffect(() => {
            const ouvrir = () => setCorrigerPoste(true);
            window.addEventListener('open-poste-config', ouvrir);
            return () => window.removeEventListener('open-poste-config', ouvrir);
      }, []);

      const [currentUser, setCurrentUser] = React.useState(null);
      const [authChecked, setAuthChecked] = React.useState(false);

      React.useEffect(() => {
            // Sincroniza com window.auth
            if (window.auth) {
                  setCurrentUser(window.auth.getUser());
                  const unsubscribe = window.auth.onAuthChange(setCurrentUser);
                  setAuthChecked(true);
                  return unsubscribe;
            }
      }, []);

      const [currentPoint, setCurrentPoint] = React.useState(null);
      const [accessLogs, setAccessLogs] = React.useState([]);
      /**
       * "Mostrar as passagens de quem está POSTADO neste ponto".
       *
       * Desligado por padrão: a repetição do dia do porteiro (e da Vie Scolaire
       * de plantão no portão) é o ruído que motivou a marcação. Vive aqui, e
       * não dentro do SectorView, porque o filtro é do SERVIDOR — a busca
       * precisa refazer-se quando ele muda, e é esta função que busca.
       */
      const [incluirRepeticoes, setIncluirRepeticoes] = React.useState(false);
      const [activeTimers, setActiveTimers] = React.useState([]);
      const [toast, setToast] = React.useState(null);
      const [accessModal, setAccessModal] = React.useState(null);
      const [showSettings, setShowSettings] = React.useState(false);
      const [adminView, setAdminView] = React.useState(false);
      // De ONDE a tela atual foi aberta — é o que faz o "voltar" do header
      // devolver ao Painel Administrativo quem veio dele, em vez de jogar
      // todo mundo no Dashboard e obrigar a refazer o caminho (PIN incluso).
      const [origemAdmin, setOrigemAdmin] = React.useState(false);
      const [showAdminPinModal, setShowAdminPinModal] = React.useState(false);

      const handleAdminToggle = React.useCallback((enabled) => {
            setAdminView(enabled);
            if (enabled) setCurrentPoint(null); // clear sector when entering admin
      }, []);

      /**
       * Parâmetros de relatório, buscados UMA vez depois do login.
       *
       * O piso de visita curta vive em magbo.report.min-visit-seconds, no
       * backend, mas o Rapport CDI é calculado no cliente. Sem esta busca o JS
       * usaria o próprio número e, mudada a property, a mesma tela mostraria
       * dois valores para o mesmo dia. Se falhar, o reportFilters segue com o
       * fallback dele — a tela nunca fica sem piso.
       */
      React.useEffect(() => {
            if (!currentUser) return;
            let vivo = true;
            // A busca e o comportamento em falha vivem em
            // js/utils/reportConfig.js, com teste — inclusive o caso que
            // importa, que é o servidor não responder e a tela seguir com o
            // fallback em vez de ficar sem piso.
            // A MESMA busca serve duas telas: o piso de visita do Rapport
            // CDI e os horários/durações do Moniteur Cantine. Uma requisição,
            // uma fonte — foi por terem números espelhados no JS que a mesma
            // tela chegou a mostrar dois valores para o mesmo dia.
            window.MagboReportConfig.carregar(window.api, window.MagboReport, console, window.MagboCantine)
                  .then(r => { if (vivo && !r.ok) console.warn('[report-config]', r.motivo); });
            return () => { vivo = false; };
      }, [currentUser]);

      /**
       * L'ETAT DE LA LICENCE, cherche UNE fois apres la connexion (ADR-006).
       *
       * ⚠️ LE FRONT NE DECIDE RIEN ICI. C'est le serveur qui refuse les routes
       * de gestion ; ceci ne sert qu'a AFFICHER un etat deja tranche. Une
       * verification cote client serait contournee en remplacant le .exe du
       * poste par une version anterieure — et sur ces postes, remplacer un
       * executable est une manipulation ordinaire.
       *
       * ⚠️ UN ECHEC NE CASSE RIEN : `getLicence` rend `null` au lieu de lever,
       * et sans etat il n'y a simplement pas de bandeau. Un backend d'une
       * version anterieure (sans cette route) doit continuer a faire tourner
       * le portail — la licence est une information commerciale, elle ne peut
       * pas eteindre un poste de travail.
       */
      const [licence, setLicence] = React.useState(null);
      React.useEffect(() => {
            if (!currentUser) { setLicence(null); return; }
            let vivo = true;
            const relire = () => {
                  if (window.api && window.api.getLicence) {
                        window.api.getLicence().then(l => { if (vivo) setLicence(l); });
                  }
            };
            relire();
            // ⚠️ RELU PÉRIODIQUEMENT, et pas une seule fois par session. Deux
            // raisons, la seconde étant la vraie : (1) la bascule COURTOISIE →
            // EXPIREE tombe à 03h17, donc quelqu'un connecté avant travaillerait
            // sans bandeau en se cognant à des 402 ; (2) surtout, APRÈS UN
            // RENOUVELLEMENT, tout le monde continuerait de lire « fonctions
            // suspendues » jusqu'à sa prochaine connexion — et quelqu'un
            // téléphonerait à Sam pour dire que sa clé n'a pas marché.
            // Dix minutes : la requête est minuscule et ne porte aucune donnée
            // de personne. (Panel de revue, 31/08/2026.)
            const tique = setInterval(relire, 10 * 60 * 1000);
            return () => { vivo = false; clearInterval(tique); };
      }, [currentUser]);

      /**
       * Liga o cache de fotos à camada HTTP, uma vez.
       *
       * Fica aqui e não dentro do módulo porque o módulo é puro (e testável
       * sem rede) de propósito: ele sabe cachear, não sabe buscar. E a busca
       * PRECISA passar por window.api, que é quem põe o token — o endpoint da
       * foto é autenticado, e essa é a única coisa que impede a foto de um
       * aluno de estar a um GET de distância na rede da escola.
       */
      React.useEffect(() => {
            if (window.MagboPhotoCache && window.api) {
                  window.MagboPhotoCache.configure((userId) => window.api.fetchUserPhoto(userId));
            }
      }, []);

      React.useEffect(() => {
            const handleOpenSettings = () => setShowSettings(true);
            window.addEventListener('open-settings', handleOpenSettings);
            return () => window.removeEventListener('open-settings', handleOpenSettings);
      }, []);

      React.useEffect(() => {
            const openHandler = () => setShowAdminPinModal(true);
            window.addEventListener('open-admin-pin', openHandler);
            return () => window.removeEventListener('open-admin-pin', openHandler);
      }, []);

      // Logs registrados localmente pelo operador que o servidor ainda não devolveu,
      // e logs que ele cancelou no PortariaModal (o cancelamento é só de tela — a
      // linha continua no banco, logo a recarga precisa filtrá-la para não ressuscitar).
      const pendingLogIdsRef = React.useRef(new Set());
      const dismissedLogIdsRef = React.useRef(new Set());

      // Recarga pausa enquanto um modal de acesso está aberto: o fluxo do modal
      // depende de accessLogs estável (o onCancel remove o log otimista pelo id).
      const accessModalRef = React.useRef(null);
      React.useEffect(() => { accessModalRef.current = accessModal; }, [accessModal]);

      // Reconstruir logs globais e timers dinamicamente ao abrir um Setor (F5 / Reload proof)
      // e a cada SECTOR_POLL_MS, para que eventos vindos do hardware apareçam ao vivo.
      React.useEffect(() => {
            if (!currentPoint) return;
            const pointId = currentPoint.id;
            let cancelled = false; // resposta de um setor anterior nunca é aplicada ao atual
            let inFlight = false;  // uma recarga em voo bloqueia a próxima (sem atropelo)

            pendingLogIdsRef.current = new Set();
            dismissedLogIdsRef.current = new Set();

            const loadPointData = async (isInitial) => {
                  if (inFlight) return;
                  inFlight = true;
                  try {
                        const logs = await fetchLogs(pointId, { incluirRepeticoes });
                        if (cancelled) return;

                        // Guard: ensure logs is always an array (fetchLogs already normalises)
                        if (!Array.isArray(logs)) { if (isInitial) setAccessLogs([]); return; }
                        if (isInitial) {
                              setAccessLogs(logs);
                        } else {
                              const serverIds = new Set(logs.map(l => l.id));
                              pendingLogIdsRef.current = new Set(
                                    [...pendingLogIdsRef.current].filter(id => !serverIds.has(id))
                              );
                              const pending = pendingLogIdsRef.current;
                              const fresh = logs.filter(l => !dismissedLogIdsRef.current.has(l.id));
                              // mantém o registro recém-processado até o servidor devolvê-lo (sem piscada)
                              setAccessLogs(prev => fresh.concat(prev.filter(l => pending.has(l.id))));
                        }

                        if (isEspecial(pointId) || pointId.startsWith('REFEI')) {
                              const latestByUser = {};
                              logs.forEach(l => {
                                    const lTime = safeDateParse(l.timestamp);
                                    const existingTime = latestByUser[l.userId] ? safeDateParse(latestByUser[l.userId].timestamp) : 0;
                                    if (!latestByUser[l.userId] || lTime > existingTime) {
                                          latestByUser[l.userId] = l;
                                    }
                              });

                              const newTimers = [];
                              for (const uId in latestByUser) {
                                    const log = latestByUser[uId];
                                    if (log.status === 'ENTRADA') {
                                          newTimers.push({
                                                userId: uId,
                                                pointId: pointId,
                                                startTime: safeDateParse(log.timestamp)
                                          });
                                    }
                              }
                              if (isInitial) {
                                    setActiveTimers(newTimers);
                              } else {
                                    // preserva o startTime já em tela p/ o cronômetro não reiniciar a cada ciclo
                                    setActiveTimers(prev => newTimers.map(t => {
                                          const existing = prev.find(p => p.userId === t.userId && p.pointId === t.pointId);
                                          return existing ? { ...t, startTime: existing.startTime } : t;
                                    }));
                              }
                        }
                  } catch (e) {
                        if (cancelled) return;
                        // Só a carga inicial avisa o operador: com recarga a cada poucos
                        // segundos e servidor fora do ar, um toast por ciclo tornaria a
                        // tela inutilizável.
                        if (isInitial) {
                              setToast({ title: t('app.erro.comunicacao'), message: e.message, type: 'error' });
                        } else {
                              console.warn('[App] falha na recarga periódica do setor', pointId, e.message);
                        }
                  } finally {
                        inFlight = false;
                  }
            };

            loadPointData(true);

            if (!rendersSectorView(currentPoint)) return () => { cancelled = true; };

            const interval = setInterval(() => {
                  if (accessModalRef.current) return;
                  loadPointData(false);
            }, SECTOR_POLL_MS);

            return () => {
                  cancelled = true;
                  clearInterval(interval);
            };
            // incluirPostoFixo entra nas dependências porque o filtro é do
            // servidor: ligar o botão tem que REBUSCAR, não refiltrar o que já
            // está em tela (as linhas escondidas nunca chegaram ao cliente).
      }, [currentPoint, incluirRepeticoes]);

      // Trocar de setor volta ao padrão. O botão é um recurso de diagnóstico —
      // "quanto ruído o posto fixo está absorvendo aqui?" —, não uma
      // preferência que deva seguir o operador pela portaria e pela enfermaria.
      React.useEffect(() => { setIncluirRepeticoes(false); }, [currentPoint]);

      // ─────────────────────────────────────────────────────────────
      // processAccess — Lógica de Negócio Assíncrona Integrada (API)
      // ─────────────────────────────────────────────────────────────
      const processAccess = React.useCallback(async (userId, pointId) => {
            try {
                  // 1. Busca Segura do Usuário com Tratamento Contínuo 
                  const data = await fetchUser(userId);
                  
                  // Guard: API returned incomplete payload
                  if (!data || !data.user) {
                        window.playErrorBeep?.();
                        setToast({ title: t('app.erro.dados'), message: t('app.erro.usuario'), type: 'error' });
                        return;
                  }
                  
                  const user = data.user;
                  const responsavel = data.responsavel || null;

                  const lastLog = [...accessLogs]
                        .filter(l => l.userId === userId && l.pointId === pointId)
                        .sort((a, b) => safeDateParse(b.timestamp) - safeDateParse(a.timestamp))[0];

                  const status = (!lastLog || lastLog.status === 'SAIDA') ? 'ENTRADA' : 'SAIDA';
                  const now = Date.now();

                  // Regra de Negócio: Bloqueio de Saída Precoce na Cantina (10 minutos) APENAS PARA ALUNOS
                  let errorTempoMinimo = false;
                  if (pointId.startsWith('REFEI') && status === 'SAIDA' && user.tipo === 'ALUNO') {
                        const timer = activeTimers.find(t => t.userId === userId && t.pointId === pointId);
                        if (timer && (now - timer.startTime < 10 * 60 * 1000)) { // 10 minutes
                              errorTempoMinimo = true;
                        }
                  }

                  // 2. Registro no Backend com análise de Duplicidade (Constraint: Refeitório)
                  let isRefeicaoDuplicada = false;
                  let newLog;
                  
                  if (errorTempoMinimo) {
                        // Não bate na API. Simula evento local para acionar o Modal Vermelho.
                        newLog = { id: `block-${now}`, userId, pointId, status: 'ENTRADA', timestamp: new Date().toISOString() };
                  } else {
                        try {
                              newLog = await registerAccess({ userId, pointId, action: status });
                              // registerAccess (utils/api.js) already normalises: .status and .timestamp are set
                              if (!newLog) throw new Error(t('app.erro.registro'));
                        } catch (error) {
                              if (error.code === 'DUPLICATE' || (error.message || '').includes('DUPLICATE_MEAL') || (error.message || '').includes('Duplicidade')) {
                                    isRefeicaoDuplicada = true;
                                    newLog = { id: `dup-${now}`, userId, pointId, status: 'ENTRADA', timestamp: new Date().toISOString() };
                              } else {
                                    throw error; // Propaga erro crítico (500/404)
                              }
                        }
                  }

                  // 3. Regra Especial Biblioteca & Refeitório: Atualiza Timers p/ Relógio e Bloqueio
                  if ((isEspecial(pointId) || pointId.startsWith('REFEI')) && !isRefeicaoDuplicada && !errorTempoMinimo) {
                        if (status === 'ENTRADA') {
                              setActiveTimers(prev => [...prev, { userId, pointId, startTime: now }]);
                        } else {
                              setActiveTimers(prev => prev.filter(t => !(t.userId === userId && t.pointId === pointId)));
                        }
                  }

                  if (!isRefeicaoDuplicada && !errorTempoMinimo) {
                        pendingLogIdsRef.current.add(newLog.id); // protege da recarga até o servidor devolvê-lo
                        setAccessLogs(prev => [...prev, newLog]);
                  }

                  // 4. Acionamento Robusto de Modais 
                  if (isPortaria(pointId) && (user.tipo === 'RESPONSAVEL' || user.tipo === 'ALUNO')) {
                        // Modal Duplo Exclusivo para Portarias — only if a REAL responsável exists
                        if (responsavel && responsavel.id) {
                              window.playSuccessBeep?.();
                              setAccessModal({ type: 'portaria', responsavel, alunos: [user], logId: newLog.id });
                        } else {
                              // Aluno sem responsável cadastrado → show simple sector modal with warning
                              window.playSuccessBeep?.();
                              setAccessModal({ 
                                    type: 'sector', 
                                    user, 
                                    bannerProps: { 
                                          text: status === 'ENTRADA' ? t('app.banner.acesso.liberado') : t('app.banner.saida.liberada'), 
                                          subtext: t('app.banner.sem.responsavel'), 
                                          type: 'success' 
                                    } 
                              });
                        }
                  } else if (isEspecial(pointId) || pointId.startsWith('REFEI')) {
                        let bannerProps = { text: status === 'ENTRADA' ? t('app.banner.acesso.liberado') : t('app.banner.saida.liberada'), type: 'success' };
                        let beepType = 'success';

                        if (errorTempoMinimo) {
                              bannerProps = { text: t('app.banner.bloqueado'), subtext: t('app.banner.tempo.minimo'), type: 'alert' };
                              beepType = 'error';
                        } else if (isRefeicaoDuplicada) {
                              // Constraint 3 (Refeitório): Banner Vemelho Central Absoluto!
                              bannerProps = { text: t('app.banner.refeicao.dup'), subtext: t('app.banner.refeicao.dup.sub'), type: 'alert' };
                              beepType = 'error';

                        } else if (isEspecial(pointId)) {
                              if (status === 'ENTRADA') {
                                    bannerProps = { text: t('app.banner.permanencia.max'), subtext: t('app.banner.timer.iniciado'), type: 'success' };
                              } else {
                                    // SAIDA
                                    const timer = activeTimers.find(t => t.userId === userId && t.pointId === pointId);
                                    if (timer && (now - timer.startTime > 7200 * 1000)) {
                                          bannerProps = { text: t('app.banner.tempo.excedido'), subtext: t('app.banner.tempo.excedido.sub'), type: 'alert' };
                                          beepType = 'error';
                                    } else {
                                          bannerProps = { text: t('app.banner.saida.liberada'), subtext: t('app.banner.dentro.tempo'), type: 'success' };
                                    }
                              }
                        }

                        if (beepType === 'error') window.playErrorBeep?.();
                        else window.playSuccessBeep?.();

                        setAccessModal({ type: 'sector', user, bannerProps });
                  } else {
                        // Portaria Normal (Funcionário/Prof) e afins..
                        window.playSuccessBeep?.();
                        setAccessModal({ type: 'sector', user, bannerProps: { text: status === 'ENTRADA' ? t('app.banner.acesso.liberado') : t('app.banner.saida.liberada'), type: 'success' } });
                  }
            } catch (error) {
                  // Constraint 4: Try/Catch super resiliente contra quedas de Backend
                  window.playErrorBeep?.();
                  setToast({ title: t('app.erro.comunicacao'), message: error.message || t('app.erro.desconhecido'), type: 'error' });
            }
      }, [accessLogs, activeTimers, currentPoint]);

      // ══════════════════════════════════════════════════════════════
      // PREMIÈRE CONFIGURATION DU POSTE (ADR-007)
      // ══════════════════════════════════════════════════════════════
      // ⚠️ AVANT LE LOGIN, et il ne peut pas en être autrement : sans adresse
      // de serveur il n'y a personne à qui demander un mot de passe. C'est
      // aussi pourquoi cet écran ne dépend d'aucune permission — il n'y a pas
      // encore de session pour en porter une. Ce qu'il protège n'est pas un
      // secret : c'est l'adresse d'un serveur déjà écrite dans un .bat sur le
      // bureau, à côté du .exe.
      //
      // ⚠️ NE S'AFFICHE JAMAIS sur un poste lancé par `Abrir-MAGBO.bat` : les
      // variables d'environnement priment et `doitConfigurer` est faux. Le
      // parc existant ne voit pas cet écran.
      if (poste.doitConfigurer) {
            return (
                  <ErrorBoundary nom={t('poste.titre')}
                                 sousTitre={t('poste.erreur.sous')}
                                 avis={t('poste.erreur.avis')}>
                        <PremierLancement
                              configInitiale={poste}
                              mode="premier"
                              onQuitter={() => {
                                    if (window.magboConfig && window.magboConfig.quitter) {
                                          window.magboConfig.quitter();
                                    }
                              }}
                              onTermine={(nouvelle) => setPoste(nouvelle)} />
                  </ErrorBoundary>
            );
      }

      // Se não logado → mostra LoginScreen
      if (!currentUser) {
            // Sem `onRetour`: da tela de login não há para onde voltar. Sobra
            // "Recharger l'application", que é exatamente o gesto certo aqui.
            return (
                  <ErrorBoundary nom={t('erro.tela.login')}>
                        <LoginScreen onLoginSuccess={(data) => setCurrentUser(window.auth.getUser())} />
                  </ErrorBoundary>
            );
      }

      // ── Correction du réglage du poste, demandée depuis l'engrenage ──
      // ⚠️ Le contrôle de permission est fait par l'ENGRENAGE (l'onglet n'existe
      // que pour CONFIG_WRITE) : ici on ne fait que rendre l'écran demandé.
      // Le refuser une seconde fois ne protégerait rien de plus et donnerait
      // deux endroits où la règle peut diverger.
      if (corrigerPoste) {
            return (
                  <ErrorBoundary nom={t('poste.titre.correction')}
                                 onRetour={() => setCorrigerPoste(false)}
                                 labelRetour={t('erro.voltar')}>
                        <PremierLancement
                              configInitiale={poste}
                              mode="correction"
                              onAnnuler={() => setCorrigerPoste(false)}
                              onTermine={(nouvelle) => { setPoste(nouvelle); setCorrigerPoste(false); }} />
                  </ErrorBoundary>
            );
      }

      // ── Biblioteca → Full CDI experience ──
      if (currentPoint && currentPoint.id === 'BIBLIO') {
            // O CDI é uma aplicação inteira dentro da outra (tela cheia, sem o
            // Header do MAGBO). Um erro aqui não tem cromo nenhum para sobrar —
            // por isso o boundary é o próprio caminho de volta ao painel.
            //
            // ⚠️ LE BANDEAU DE LICENCE EST ICI AUSSI, et il l'est DEDANS le
            // boundary — contrairement à l'application principale, où il est
            // dehors. La raison tient au kiosque : ici il n'y a aucun chrome
            // pour survivre, donc un bandeau qui tomberait emporterait tout
            // l'écran du CDI. Mieux vaut perdre le message que la banque de prêt.
            //
            // Pourquoi il fallait l'ajouter : ce `return` est ANTÉRIEUR à celui
            // de l'application, donc aucun état de licence n'atteignait jamais
            // le CDI. Or la documentaliste détient CDI_EXCLUSION_WRITE — son
            // écran d'exclusions se ferme — et elle passe sa journée ici.
            // (Panel de revue — Vie Scolaire, 31/08/2026.)
            return (
                  <div className="h-screen overflow-hidden">
                        <ErrorBoundary
                              nom={pointLabel('BIBLIO')}
                              onRetour={() => setCurrentPoint(null)}
                              labelRetour={t('erro.voltar')}>
                              <LicenceBanner licence={licence} auth={window.auth} />
                              <BibliotecaView onBack={() => setCurrentPoint(null)} />
                        </ErrorBoundary>
                  </div>
            );
      }

      return (
            <div className="min-h-screen bg-soft-100 pb-12">
                  <Header
                  currentPoint={currentPoint}
                  onBack={() => { setCurrentPoint(null); setAdminView(false); setOrigemAdmin(false); }}
                  adminView={adminView}
                  onAdminToggle={handleAdminToggle}
                  voltar={
                        // O destino NOMEADO do botão voltar — null no Dashboard
                        // (raiz, não há para onde voltar). Quem veio do painel
                        // volta ao PAINEL, sem redigitar o PIN: a sessão admin
                        // é a mesma, só a tela mudou.
                        adminView
                              ? { label: t('header.dashboard'), acao: () => { setAdminView(false); setOrigemAdmin(false); } }
                              : currentPoint && origemAdmin
                                    ? { label: t('header.painel'), acao: () => { setCurrentPoint(null); setAdminView(true); } }
                                    : currentPoint
                                          ? { label: t('header.dashboard'), acao: () => setCurrentPoint(null) }
                                          : null
                  }
            />

            {/* Le bandeau de licence — sous le Header, au-dessus de tout ecran.
                ⚠️ HORS de l'ErrorBoundary : s'il etait dedans, l'ecran qui
                tombe emporterait avec lui le message qui explique pourquoi il
                est peut-etre tombe. Qui le voit est decide par
                js/utils/licence.js (module pur, teste) ; il ne s'affiche pour
                personne tant que la licence est VALIDE. */}
            <LicenceBanner licence={licence} auth={window.auth} />

            {/* ⚠️ UMA rede por TELA, e é aqui que ela vale mais.
                O erro de uma tela custa a tela: o Header continua desenhado,
                o botão de volta continua funcionando, e as outras telas
                continuam alcançáveis. Sem isto — e foi assim até 20/08/2026 —
                qualquer exceção de renderização subia até a raiz, o React
                desmontava a árvore inteira e a janela ficava BRANCA e travada.

                `resetKey` é o que impede o boundary de ficar preso: sem ele,
                uma tela que quebrou deixaria o fallback no lugar mesmo depois
                de o operador navegar para outra. */}
            <ErrorBoundary
                  nom={adminView ? t('erro.tela.admin')
                        : !currentPoint ? t('erro.tela.dashboard')
                        : pointLabel(currentPoint.id)}
                  resetKey={adminView ? 'ADMIN' : (currentPoint ? currentPoint.id : 'DASHBOARD')}
                  onRetour={(adminView || currentPoint)
                        ? () => { setCurrentPoint(null); setAdminView(false); setOrigemAdmin(false); }
                        : null}
                  labelRetour={t('erro.voltar')}>
            {adminView ? (
                  <AdminDashboard
                        onBack={() => setAdminView(false)}
                        onShowToast={setToast}
                        activeTimers={activeTimers}
                        onNavigateToReport={() => {
                              setAdminView(false);
                              const pt = ACCESS_POINTS.find(p => p.id === 'GENERAL_REPORT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToMeal={() => {
                              setAdminView(false);
                              setOrigemAdmin(true);
                              const pt = ACCESS_POINTS.find(p => p.id === 'MEAL_ENTITLEMENT_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToMealSlots={() => {
                              setAdminView(false);
                              setOrigemAdmin(true);
                              const pt = ACCESS_POINTS.find(p => p.id === 'MEAL_SLOT_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToExit={() => {
                              setAdminView(false);
                              setOrigemAdmin(true);
                              const pt = ACCESS_POINTS.find(p => p.id === 'EXIT_PERMISSION_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToRegime={() => {
                              setAdminView(false);
                              setOrigemAdmin(true);
                              const pt = ACCESS_POINTS.find(p => p.id === 'REGIME_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                        onNavigateToCdiExclusions={() => {
                              setAdminView(false);
                              setOrigemAdmin(true);
                              const pt = ACCESS_POINTS.find(p => p.id === 'CDI_EXCLUSION_MANAGEMENT');
                              if (pt) setCurrentPoint(pt);
                        }}
                  />
            ) : !currentPoint ? (
                        <Dashboard
                              onSelectPoint={(pt) => { setOrigemAdmin(false); setCurrentPoint(pt); }}
                              accessLogs={accessLogs}
                        />
                  ) : currentPoint && currentPoint.id === 'CANTINA_MONITOR' ? (
                        <CantineMonitor />
                  ) : currentPoint && currentPoint.id === 'CANTINA_REPORT' ? (
                        <RefectoryReport />
                  ) : currentPoint && currentPoint.id === 'INFIRMARY_REPORT' ? (
                        <InfirmaryReport />
                  ) : currentPoint && currentPoint.id === 'GENERAL_REPORT' ? (
                        <GeneralReport onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'CDI_EXCLUSION_MANAGEMENT' ? (
                        <CdiExclusionManagement onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'MEAL_SLOT_MANAGEMENT' ? (
                        <MealSlotManagement onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'MEAL_ENTITLEMENT_MANAGEMENT' ? (
                        <MealEntitlementManagement onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'EXIT_PERMISSION_MANAGEMENT' ? (
                        <ExitPermissionManagement onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'REGIME_MANAGEMENT' ? (
                        <StudentRegimeManagement onBack={() => setCurrentPoint(null)} />
                  ) : currentPoint && currentPoint.id === 'PPMS' ? (
                        <PpmsView onBack={() => setCurrentPoint(null)} />
                  ) : (
                  <SectorView
                        point={currentPoint}
                        accessLogs={accessLogs}
                        onProcess={processAccess}
                        activeTimers={activeTimers}
                        incluirRepeticoes={incluirRepeticoes}
                        onToggleRepeticoes={setIncluirRepeticoes}
                  />
            )}
            </ErrorBoundary>

                  {/* CROMO — variante `discret`: não desenha NADA em caso de erro.
                      Um Toast quebrado (foi exatamente o defeito de 48ffa19) deve
                      custar a notificação, nunca a tela de quem está trabalhando;
                      e um aviso vermelho permanente no lugar do sino seria a
                      segunda maneira de estragar a mesma tela. */}
                  <ErrorBoundary nom="Toast" variante="discret">
                        <Toast toast={toast} onDismiss={() => setToast(null)} />
                  </ErrorBoundary>

                  <AdminPinModal
                        open={showAdminPinModal}
                        onClose={() => setShowAdminPinModal(false)}
                        onSuccess={() => {
                              setShowAdminPinModal(false);
                              handleAdminToggle(true);
                        }}
                  />

                  {accessModal && accessModal.type === 'portaria' && (
                        <ErrorBoundary nom={t('erro.tela.modal.portaria')} variante="modal"
                              onRetour={() => setAccessModal(null)} labelRetour={t('erro.fechar')}>
                        <PortariaModal
                              responsavel={accessModal.responsavel}
                              alunos={accessModal.alunos}
                              onConfirm={() => setAccessModal(null)}
                              onCancel={() => {
                                    pendingLogIdsRef.current.delete(accessModal.logId);
                                    dismissedLogIdsRef.current.add(accessModal.logId);
                                    setAccessLogs(prev => prev.filter(l => l.id !== accessModal.logId));
                                    setAccessModal(null);
                              }}
                        />
                        </ErrorBoundary>
                  )}

                  {accessModal && accessModal.type === 'sector' && (
                        <ErrorBoundary nom={t('erro.tela.modal.passagem')} variante="modal"
                              onRetour={() => setAccessModal(null)} labelRetour={t('erro.fechar')}>
                        <PermanenciaModal
                              user={accessModal.user}
                              bannerProps={accessModal.bannerProps}
                              onClose={() => setAccessModal(null)}
                        />
                        </ErrorBoundary>
                  )}

                  {showSettings && (
                        <ErrorBoundary nom={t('erro.tela.parametres')} variante="modal"
                              onRetour={() => setShowSettings(false)} labelRetour={t('erro.fechar')}>
                        <AppSettingsModal
                              onClose={() => setShowSettings(false)}
                              onShowToast={setToast}
                        />
                        </ErrorBoundary>
                  )}

                  {/* Footer */}
                  <footer className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur border-t border-soft-200 z-40">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
                              <p className="text-[11px] text-slate-400">
                                    MAGBO Access Control v1.0 · Lycée Molière · 2026 ·{' '}
                                    <a href="https://www.sammagbo.com" target="_blank" rel="noopener noreferrer" className="text-[#00234b] font-semibold hover:underline">MAGBO STUDIO</a>
                              </p>
                              <ErrorBoundary nom="ConnectionStatus" variante="discret">
                                    <ConnectionStatus />
                              </ErrorBoundary>
                        </div>
                  </footer>
            </div>
      );
}

// =====================================================================
// RENDER
// =====================================================================

const root = ReactDOM.createRoot(document.getElementById('root'));

// ⚠️ A REDE DA RAIZ é a última, e cobre o que nenhuma outra cobre: um erro no
// PRÓPRIO App (os seus hooks, os seus efeitos, o Header) acontece ACIMA de
// todos os boundaries internos. Sem ela, esse caso continuaria produzindo a
// tela branca — que é precisamente o desastre de 48ffa19, cujo defeito
// (ordem de hooks no Toast) estourava na renderização do App.
//
// Sem `onRetour` de propósito: aqui não existe "voltar" — o estado de
// navegação mora dentro do componente que acabou de falhar. O que resta, e
// funciona sempre, é recarregar.
root.render(
      <ErrorBoundary nom="MAGBO Access Control">
            <App />
      </ErrorBoundary>
);
