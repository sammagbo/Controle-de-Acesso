// =====================================================================
// BibliotecaView — Main CDI Component (Local Version)
// =====================================================================

/** Cadência da recarga periódica do CDI (mesma do CantineMonitor). */
const CDI_POLL_MS = 3000;

/**
 * LE BANDEAU — « on est au maximum », et l'etat declare de la salle.
 *
 * ⚠️ AU SCOPE DU MODULE ET RENDU DANS LES DEUX MODES. Il vivait dans le bloc
 * `if (emergency)`, c'est-a-dire dans le mode utilise quelques minutes par an :
 * declarer le CDI ferme n'affichait rien en service normal. Une fonction dont
 * l'affichage n'existe que dans un mode d'exception n'existe pas.
 *
 * ⚠️ ET C'EST UN BANDEAU, PAS UN TOAST. « La salle est pleine » reste vrai
 * tant que c'est vrai — l'information n'a pas de duree de trois secondes.
 */
function CdiBandeauEtat({ dedans, capacite, etat, sombre }) {
      const t = useI18n();
      const cheio = dedans >= capacite;
      const declarado = etat && etat.estado && etat.estado !== 'OUVERT';
      if (!cheio && !declarado) return null;
      return (
            <>
                  {cheio && (
                        <div className={`mt-3 mx-auto max-w-2xl px-4 py-3 rounded-2xl border-2 ${
                              sombre ? 'bg-amber-900/40 border-amber-500 text-amber-100'
                                     : 'bg-amber-100 border-amber-500 text-amber-900'}`}>
                              <p className="text-2xl font-black">{t('cdi.complet.titre')}</p>
                              <p className="text-lg font-bold">
                                    {t('cdi.complet.detail', { n: dedans, m: capacite })}
                              </p>
                              <p className="text-sm mt-1">{t('cdi.complet.note')}</p>
                        </div>
                  )}
                  {declarado && (
                        <div className={`mt-3 mx-auto max-w-2xl px-4 py-3 rounded-2xl border-2 ${
                              sombre ? 'bg-purple-900/40 border-purple-500 text-purple-100'
                                     : 'bg-purple-100 border-purple-500 text-purple-900'}`}>
                              <p className="text-2xl font-black">{t('cdi.etat.' + etat.estado)}</p>
                              {(etat.estadoInicio || etat.estadoFim) && (
                                    <p className="text-lg font-bold">
                                          {etat.estadoInicio || '—'} → {etat.estadoFim || '—'}
                                    </p>
                              )}
                              {etat.estadoNota && <p className="text-sm mt-1">{etat.estadoNota}</p>}
                        </div>
                  )}
            </>
      );
}

function BibliotecaView({ onBack }) {
      const { useState, useEffect, useRef, useCallback, useMemo } = React;
      const t = useI18n();

      // Helper: Map Backend Data to View Format
      const mapToView = useCallback((s) => ({
            id: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            class: s.studentClass || '',
            present: !!s.present,
            lastEntry: s.lastEntry
      }), []);

      // State
      const [students, setStudents] = useState([]);
      const [presentStudents, setPresentStudents] = useState(new Set());
      // L'état du CDI, relu au même rythme que le reste : capacité réglable,
      // état d'occupation, et les cibles d'exclusion ACTIVES (sans motif ni
      // auteur — l'écran doit reconnaître, pas raconter).
      const [cdiEtat, setCdiEtat] = useState(null);
      // La grande alerte visuelle. Un seul état : deux alertes empilées
      // seraient deux choses à lire au moment où il faut en lire zéro.
      const [alerte, setAlerte] = useState(null);
      const [logs, setLogs] = useState([]);
      const [loading, setLoading] = useState(true);

      /**
       * Contar o PESSOAL junto com os alunos.
       *
       * Padrão false — o CDI é sobre alunos. Os servidores entram por segundos,
       * quase nunca passam o rosto na saída, e o fechamento das 17:00
       * transforma isso em permanência de um dia inteiro. A preferência fica no
       * localStorage porque é uma escolha de quem opera a tela, não do sistema.
       */
      const [incluirFuncionarios, setIncluirFuncionarios] = useState(() => {
            const salvo = localStorage.getItem('magbo.cdi.incluirFuncionarios') === 'true';
            CdiBackend.setIncluirFuncionarios(salvo);
            return salvo;
      });

      const recarregar = React.useCallback(async () => {
            // UMA leitura de /access/logs/BIBLIO alimenta as duas visões.
            // getStudents()+getLogs() em sequência buscavam o mesmo endpoint
            // duas vezes por recarga (ver CdiBackend.getSnapshot).
            const { students: localStudents, logs: localLogs } = await CdiBackend.getSnapshot();
            setStudents(localStudents.map(mapToView));
            setPresentStudents(new Set(localStudents.filter(s => s.present).map(s => s.id)));
            setLogs(localLogs);
      }, [mapToView]);

      const aplicarIncluirFuncionarios = React.useCallback((valor) => {
            setIncluirFuncionarios(valor);
            CdiBackend.setIncluirFuncionarios(valor);
            localStorage.setItem('magbo.cdi.incluirFuncionarios', valor ? 'true' : 'false');
            // Recarrega já: o filtro é aplicado na origem dos dados, então sem
            // isto a tela só mudaria no próximo ciclo de 3s.
            recarregar().catch(e => console.error('Recarga após troca de filtro:', e));
      }, [recarregar]);

      // Load Data locally
      useEffect(() => {
            const init = async () => {
                  try {
                        await recarregar();
                  } catch (e) {
                        console.error("Init Error:", e);
                        setToast({ message: t('cdi.erro.carregar'), type: 'error' });
                  } finally { setLoading(false); }
            };
            init();
      }, [recarregar]);

      const [muted, setMuted] = useState(() => localStorage.getItem(CDI_STORAGE.muted) === 'true');
      const [pin, setPin] = useState(() => localStorage.getItem(CDI_STORAGE.pin) || CDI_DEFAULT_PIN);

      const [encryptBackup, setEncryptBackup] = useState(() => localStorage.getItem('cdi_encrypt') === 'true');
      const [backupTime, setBackupTime] = useState(() => localStorage.getItem('cdi_backup_time') || '16:45');
      const [lastBackup, setLastBackup] = useState(() => localStorage.getItem('cdi_last_backup') || '');
      const [unsavedChanges, setUnsavedChanges] = useState(false);

      const [query, setQuery] = useState('');
      const [classFilter, setClassFilter] = useState(null);
      const [modal, setModal] = useState(null);
      const [flash, setFlash] = useState({ id: null, type: null });
      const [toast, setToast] = useState(null);
      const [emergency, setEmergency] = useState(false);
      const [verified, setVerified] = useState(new Set());
      const [locked, setLocked] = useState(false);
      const inputRef = useRef(null);
      const scanBuffer = useRef('');
      const scanTimeout = useRef(null);

      // Contador de mutações locais (scan, import, restauração). Uma recarga que
      // partiu ANTES de uma mutação volta com dados anteriores a ela; comparar o
      // contador na volta permite descartá-la, senão a resposta velha desfaz o
      // que o operador acabou de fazer.
      const mutationSeqRef = useRef(0);
      const bumpMutation = useCallback(() => { mutationSeqRef.current += 1; }, []);

      // Espelhos p/ o tick da recarga não precisar de `modal`/`emergency` nas
      // dependências (senão abrir um modal reiniciaria o intervalo).
      const modalRef = useRef(null);
      const emergencyRef = useRef(false);
      useEffect(() => { modalRef.current = modal; emergencyRef.current = emergency; }, [modal, emergency]);

      // ── Recarga periódica ────────────────────────────────────────────
      // Sem isto a tela do CDI carregava uma vez só, no mount: um aluno passando
      // o cartão no terminal BIBLIO não aparecia até o operador sair da tela e
      // voltar. A carga inicial (efeito acima) segue intacta — inclusive o toast
      // de erro, que só ela dispara.
      useEffect(() => {
            if (loading) return; // só começa depois da carga inicial
            let cancelled = false; // resposta que chega após desmontar é ignorada
            let inFlight = false;  // uma recarga em voo bloqueia a próxima

            const reload = async () => {
                  if (inFlight) return;
                  inFlight = true;
                  const seenSeq = mutationSeqRef.current;
                  try {
                        // Uma requisição por ciclo, não duas (getSnapshot).
                        const { students: freshStudents, logs: freshLogs } = await CdiBackend.getSnapshot();
                        if (cancelled) return;
                        // Houve mutação local durante a requisição → dado já nasceu velho.
                        if (mutationSeqRef.current !== seenSeq) return;
                        // userCache ainda vazio (ou falhou) não pode zerar a tela.
                        if (freshStudents.length === 0) return;

                        setStudents(prev => {
                              const before = new Map(prev.map(s => [s.id, s]));
                              return freshStudents.map(s => {
                                    const mapped = mapToView(s);
                                    const old = before.get(mapped.id);
                                    // quem já estava presente mantém o lastEntry de tela,
                                    // p/ nenhuma contagem de permanência saltar a cada ciclo
                                    return (old && old.present && mapped.present)
                                          ? { ...mapped, lastEntry: old.lastEntry }
                                          : mapped;
                              });
                        });
                        const dentroIds = freshStudents.filter(s => s.present).map(s => s.id);
                        const antes = presentRef.current;
                        const novos = dentroIds.filter(id => !antes.has(id));
                        setPresentStudents(new Set(dentroIds));
                        setLogs(freshLogs);
                        // ⚠️ APRES les setters : l'alerte decrit ce qui vient
                        // d'etre enregistre, pas ce qu'on espere enregistrer.
                        if (novos.length) {
                              avisarRef.current(novos, antes.size, dentroIds.length, freshStudents);
                        }
                  } catch (e) {
                        // Falha em silêncio: a cada poucos segundos, um toast por ciclo
                        // tornaria a tela inutilizável.
                        if (!cancelled) console.warn('[CDI] falha na recarga periódica:', e.message);
                  } finally {
                        inFlight = false;
                  }
            };

            const interval = setInterval(() => {
                  // Modal aberto (o gestor de alunos edita a própria lista) ou modo
                  // confinamento (conferência nominal, `verified` casado por id):
                  // não mexer nos dados sob o dedo do operador.
                  if (modalRef.current || emergencyRef.current) return;
                  reload();
            }, CDI_POLL_MS);

            return () => {
                  cancelled = true;
                  clearInterval(interval);
            };
      }, [loading, mapToView]);

      // Persist settings
      useEffect(() => { localStorage.setItem(CDI_STORAGE.muted, muted); }, [muted]);
      useEffect(() => { localStorage.setItem('cdi_encrypt', encryptBackup); }, [encryptBackup]);
      useEffect(() => { localStorage.setItem('cdi_backup_time', backupTime); }, [backupTime]);
      useEffect(() => { if (lastBackup) localStorage.setItem('cdi_last_backup', lastBackup); }, [lastBackup]);

      useEffect(() => { if (!emergency && !locked) inputRef.current?.focus(); }, [emergency, locked, modal]);
      useEffect(() => { if (!emergency) setVerified(new Set()); }, [emergency]);

      // Unsaved Changes Guard
      useEffect(() => {
            const handleBeforeUnload = (e) => { if (unsavedChanges) { e.preventDefault(); e.returnValue = ''; } };
            window.addEventListener('beforeunload', handleBeforeUnload);
            return () => window.removeEventListener('beforeunload', handleBeforeUnload);
      }, [unsavedChanges]);

      // Export Backup
      const exportBackup = useCallback((silent = false) => {
            let password = null;
            if (encryptBackup && !silent) {
                  password = prompt(t('cdi.backup.senha.definir'));
                  if (password === null) return;
            }
            // For backup, we want the raw data or we can assume state is trusted.
            // Ideally we backup internal storage state, but backing up view state is "okay" if consistent.
            // Better: fetch fresh from backend to be safe? 
            // Actually, `students` state is view-format. CdiBackend has raw format. 
            // Let's grab from Backend for consistency in backup!
            // Uma leitura só: getStudents()+getLogs() aninhados pediam o mesmo
            // endpoint duas vezes para montar UM arquivo de backup.
            CdiBackend.getSnapshot().then(({ students: rawStudents, logs: rawLogs }) => {
                  const data = {
                        version: '1.0', timestamp: new Date().toISOString(),
                        students: rawStudents, // Backup raw format
                        presentStudents: rawStudents.filter(s => s.present).map(s => s.id),
                        logs: rawLogs,
                        settings: { muted, pin, encryptBackup, backupTime }, encrypted: !!password
                  };
                  let content = JSON.stringify(data, null, 2);
                  if (password) { content = "ENC:" + SimpleCrypto.encrypt(content, password); }
                  const blob = new Blob([content], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `cdi_backup_${dayKey(new Date())}${password ? '_secure' : ''}.json`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setLastBackup(dayKey(new Date()));
                  setUnsavedChanges(false);
                  if (!silent) setToast({ message: t('cdi.backup.feito'), type: 'success' });
            });
      }, [muted, pin, encryptBackup, backupTime]);

      // Auto-Backup
      useEffect(() => {
            const checkBackup = () => {
                  const now = new Date();
                  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  // ⚠️ jour LOCAL : la sauvegarde automatique de 16:45 comparait avec un
                  // jour UTC et, apres 21 h, croyait ne pas avoir encore sauvegarde.
                  const today = dayKey(now);
                  if (timeStr === backupTime && lastBackup !== today) {
                        setToast({ message: t('cdi.backup.auto'), type: 'in' });
                        exportBackup(true);
                  }
            };
            const interval = setInterval(checkBackup, 60000);
            return () => clearInterval(interval);
      }, [backupTime, lastBackup, exportBackup]);

      // Class filters
      const classGroups = useMemo(() => {
            const groups = { 'Tous': students.length };
            students.forEach(s => {
                  const level = (s.class && typeof s.class === 'string') ? s.class.split(' ')[0] : 'Inconnu';
                  groups[level] = (groups[level] || 0) + 1;
            });
            return groups;
      }, [students]);

      // Toggle Presence
      // ⚠️ Chargé UNE fois puis à chaque cycle : une exclusion posée pendant
      // le service doit valoir au badge suivant, pas au prochain démarrage.
      useEffect(() => {
            let vivo = true;
            const ler = () => window.api.fetchCdiEtat()
                  .then(e => { if (vivo) setCdiEtat(e); })
                  .catch(() => { /* sans état : capacité de repli, aucune alerte inventée */ });
            ler();
            const id = setInterval(ler, 30000);
            return () => { vivo = false; clearInterval(id); };
      }, []);

      const capacite = (cdiEtat && Number(cdiEtat.capacidade)) || CDI_CAPACITY;

      // ⚠️⚠️ LE BADGE REEL N'ARRIVE PAS PAR `togglePresence`. Un eleve qui
      // passe sa carte au terminal BIBLIO entre par le POLLING de 3 s : le
      // premier jet n'alertait donc que sur les scans faits DANS l'ecran, et
      // ratait exactement le moment que ce chantier existe pour couvrir.
      // Releve par le panel du 27/08.
      //
      // Ces deux refs portent l'evaluation a jour jusqu'au tick, qui ne peut
      // pas la prendre en dependance sans redemarrer l'intervalle a chaque
      // rendu.
      const presentRef = useRef(new Set());
      useEffect(() => { presentRef.current = presentStudents; }, [presentStudents]);
      const avisarRef = useRef(() => {});

      /**
       * Cette personne est-elle exclue AUJOURD'HUI ?
       *
       * ⚠️ Lu depuis `exclusoesAtivas`, qui ne porte NI motif NI auteur : le
       * serveur filtre déjà par date, et l'écran du CDI n'a pas le droit de
       * lire la liste complète (donnée sensible, permission dédiée).
       */
      const exclusionDe = useCallback((student) => {
            const alvos = (cdiEtat && cdiEtat.exclusoesAtivas) || [];
            if (!student || alvos.length === 0) return null;
            const turma = (student.class || '').trim().toUpperCase();
            const porAluno = alvos.find(a => a.userId && a.userId === student.id);
            if (porAluno) return { porTurma: false, ate: porAluno.ate || null };
            const porTurma = alvos.find(a => a.turma && a.turma.trim().toUpperCase() === turma);
            return porTurma ? { porTurma: true, ate: porTurma.ate || null } : null;
      }, [cdiEtat]);

      /**
       * L'ALERTE — une seule porte, deux chemins qui y menent (le scan dans
       * l'ecran, et le badge au terminal qui arrive par le polling).
       *
       * ⚠️ « Complet » ne part que sur le FRONT MONTANT : le passage de
       * en-dessous a au-dessus du seuil. Sinon, un jour de recreation a 50
       * places, c'est une modale plein ecran et un clic de souris PAR
       * PERSONNE pendant une heure — et une alerte qu'on clique cent fois est
       * une alerte qu'on ne lit plus. Le bandeau permanent prend le relais.
       *
       * L'exclusion, elle, part a chaque fois : elle nomme un enfant.
       */
      const avisar = useCallback((mapeados, antes, depois) => {
            const excluido = mapeados.map(m => ({ m, x: exclusionDe(m) })).find(o => o.x);
            if (excluido) {
                  if (!muted) CdiSound.exclu();
                  setAlerte({ type: 'exclu', student: excluido.m,
                              porTurma: excluido.x.porTurma, ate: excluido.x.ate });
                  return true;
            }
            if (antes < capacite && depois >= capacite) {
                  if (!muted) CdiSound.complet();
                  setAlerte({ type: 'complet', dedans: depois, capacite: capacite });
                  return true;
            }
            return false;
      }, [exclusionDe, capacite, muted]);

      useEffect(() => {
            avisarRef.current = (novosIds, antes, depois, brutos) => {
                  const mapeados = novosIds
                        .map(id => brutos.find(b => b.id === id))
                        .filter(Boolean).map(mapToView);
                  avisar(mapeados, antes, depois);
            };
      }, [avisar, mapToView]);

      const togglePresence = useCallback(async (id, fromScanner = false) => {
            if (emergency || locked) return;
            try {
                  // Local Backend Call
                  const updated = await CdiBackend.scanStudent(id); // Throws if 404
                  const mapped = mapToView(updated);

                  bumpMutation(); // recarga em voo agora está desatualizada
                  setStudents(prev => prev.map(s => s.id === updated.id ? mapped : s));
                  const isEntering = updated.present;
                  setPresentStudents(prev => { const next = new Set(prev); isEntering ? next.add(updated.id) : next.delete(updated.id); return next; });
                  setLogs(prev => [...prev, { studentId: updated.id, action: isEntering ? 'IN' : 'OUT', timestamp: Date.now() }]);

                  // ⚠️ L'ORDRE DES ALERTES : l'exclusion passe AVANT « complet ».
                  // Les deux peuvent être vraies en même temps, et celle qui
                  // concerne une personne nommée l'emporte sur celle qui
                  // concerne la salle. Un seul son, une seule bannière — deux
                  // choses à lire au moment où il faut en lire zéro, c'est zéro
                  // chose lue.
                  const antes = presentStudents.size;
                  const depois = isEntering ? antes + 1 : antes - 1;
                  const alertou = isEntering ? avisar([mapped], antes, depois) : false;
                  if (!alertou) {
                        // ⚠️ `setAlerte(null)` HORS de la condition `muted`, et
                        // c'est tout l'inverse d'un detail : sans lui, le nom, la
                        // classe et la PHOTO d'un enfant exclu restaient plein
                        // ecran pendant les passages suivants, sur un poste
                        // visible depuis le comptoir par d'autres eleves.
                        setAlerte(null);
                        if (!muted) isEntering ? CdiSound.success() : CdiSound.exit();
                  }
                  if (fromScanner) setToast({ message: `${mapped.name}: ${isEntering ? t('cdi.toast.entrou') : t('cdi.toast.saiu')}`, type: isEntering ? 'in' : 'out' });
                  setFlash({ id: updated.id, type: isEntering ? 'in' : 'out' });
                  setTimeout(() => setFlash({ id: null, type: null }), 300);
            } catch (err) {
                  console.error(err);
                  if (err.status === 404 || err.message === 'Carte inconnue') {
                        if (!muted) CdiSound.error();
                        setToast({ message: t('cdi.carte.inconnue'), type: 'error' });
                  } else {
                        setToast({ message: t('cdi.erro.interno'), type: 'error' });
                  }
            }
            setQuery(''); inputRef.current?.focus();
      // ⚠️ `exclusionDe`, `capacite` et `presentStudents` DOIVENT être ici.
      // Sans elles la fermeture garde les valeurs du premier rendu : le
      // compte de présents resterait bloqué (« complet » jamais atteint, ou
      // atteint trop tôt) et une exclusion posée pendant le service ne serait
      // jamais vue. C'est le défaut qui ne se voit qu'au bout d'une heure de
      // service, quand plus personne ne fait le lien.
      }, [emergency, locked, muted, mapToView, avisar, presentStudents]);

      // Scanner
      useEffect(() => {
            const handleKeyDown = (e) => {
                  if (locked || emergency || modal) return;
                  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                  if (e.key === 'Enter' && scanBuffer.current.length > 0) { togglePresence(scanBuffer.current, true); scanBuffer.current = ''; return; }
                  if (/^[A-Za-z0-9]$/.test(e.key)) { scanBuffer.current += e.key.toUpperCase(); clearTimeout(scanTimeout.current); scanTimeout.current = setTimeout(() => { scanBuffer.current = ''; }, 100); }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
      }, [togglePresence, locked, emergency, modal]);

      // Keyboard Shortcuts
      useEffect(() => {
            const handleShortcuts = (e) => {
                  if (e.key === 'Escape') {
                        // L'alerte est la couche du dessus : elle se ferme la premiere.
                        if (alerte) { setAlerte(null); e.preventDefault(); return; }
                        if (modal) { setModal(null); e.preventDefault(); return; }
                        if (query) { setQuery(''); setClassFilter(null); e.preventDefault(); return; }
                  }
                  if (e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setLocked(true); return; }
                  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                  if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) { e.preventDefault(); inputRef.current?.focus(); return; }
            };
            window.addEventListener('keydown', handleShortcuts);
            return () => window.removeEventListener('keydown', handleShortcuts);
      }, [modal, query, alerte]);

      // Import handler
      const handleImport = async (data) => {
            const toImport = data.map(s => {
                  const parts = s.name.trim().split(' ');
                  return {
                        id: s.id,
                        firstName: parts[0],
                        lastName: parts.slice(1).join(' ') || '',
                        studentClass: s.class
                  };
            });

            await CdiBackend.importStudents(toImport);
            const refreshed = await CdiBackend.getStudents();
            bumpMutation();
            setStudents(refreshed.map(mapToView)); // FIX: Map to view format
      };

      // Filter results
      const results = useMemo(() => {
            let list = students;
            if (classFilter && classFilter !== 'Tous') list = list.filter(s => s.class.startsWith(classFilter));
            if (query.length >= 2) list = list.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || s.class.toLowerCase().includes(query.toLowerCase()));
            else if (!classFilter) list = [];
            return list;
      }, [students, query, classFilter]);

      const presentList = students.filter(s => presentStudents.has(s.id));
      const count = presentStudents.size;
      // ⚠️ `capacite`, JAMAIS `CDI_CAPACITY`. La constante ne sert plus que
      // de repli (ligne du `capacite`) : lue ici aussi, l'ecran affichait DEUX
      // capacites en meme temps — la grande alerte partait a 30 pendant que le
      // compteur restait bleu et annoncait « / 50 ». C'est `f442db9` mot pour
      // mot, le meme defaut que le plancher de visite avait deja produit.
      const isFull = count >= capacite;

      // CSS for CDI animations
      const cdiStyles = `
    @keyframes flashIn { 0% { background: #d1fae5; } 100% { background: transparent; } }
    @keyframes flashOut { 0% { background: #fee2e2; } 100% { background: transparent; } }
    @keyframes toastIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .flash-in { animation: flashIn 0.3s ease-out; }
    .flash-out { animation: flashOut 0.3s ease-out; }
    .toast { animation: toastIn 0.2s ease-out; }
  `;

      // Loading
      if (loading) return (
            <div className="h-full flex flex-col items-center justify-center bg-slate-100">
                  <style>{cdiStyles}</style>
                  <div className="w-7 h-7 bg-blue-600 text-white rounded flex items-center justify-center text-xs font-bold mb-4">CDI</div>
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <p className="mt-4 text-slate-500 text-sm">{t('cdi.carregando.dados')}</p>
            </div>
      );

      if (locked) return (
            <React.Fragment>
                  <style>{cdiStyles}</style>
                  <CdiLockScreen onUnlock={() => setLocked(false)} pin={pin} count={count} />
            </React.Fragment>
      );

      // EMERGENCY MODE
      if (emergency) {
            return (
                  <div className="h-full flex flex-col bg-black">
                        <style>{cdiStyles}</style>
                        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
                              <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-600 text-white rounded flex items-center justify-center"><CdiIcon name="shield-alert" size={24} /></div>
                                    <span className="font-bold text-white text-lg">{t('cdi.confinamento')}</span>
                              </div>
                              <span className="font-mono text-white"><CdiClock /></span>
                        </header>
                        <div className="py-6 text-center bg-gray-900/50 border-b border-gray-800">
                              <div className="text-8xl font-bold text-white">{count}</div>
                              <p className="text-xl text-gray-400 uppercase">{t('cdi.presentes.confirmados')}</p>
                              <CdiBandeauEtat dedans={count} capacite={capacite} etat={cdiEtat} sombre />
                              <p className="text-green-500 mt-2">{verified.size} / {count} {t('cdi.verificados')}</p>
                        </div>
                        <main className="flex-1 overflow-y-auto p-6">
                              <div className="max-w-3xl mx-auto space-y-3">
                                    {presentList.map(s => {
                                          const isV = verified.has(s.id);
                                          return (
                                                <div key={s.id} onClick={() => setVerified(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                                                      className={`p-5 rounded-xl flex justify-between items-center cursor-pointer border-2 ${isV ? 'bg-green-900/30 border-green-500' : 'bg-gray-900 border-gray-700'}`}>
                                                      <div className="flex items-center gap-4">
                                                            {/* Na chamada de emergência o visto VENCE o
                                                                retrato: quem está conferindo precisa ver,
                                                                de longe, quem já foi contado — a foto ali
                                                                atrapalharia a única coisa que importa. */}
                                                            {isV ? (
                                                                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-500 text-white">
                                                                        <CdiIcon name="check" size={24} />
                                                                  </div>
                                                            ) : (
                                                                  <PersonPhoto userId={s.id} nome={s.name}
                                                                        className="w-12 h-12 rounded-full object-cover bg-gray-700 shrink-0" />
                                                            )}
                                                            <div>
                                                                  <div className="text-2xl font-bold text-white">{s.name}</div>
                                                                  <div className="text-lg text-yellow-400">{s.class}</div>
                                                            </div>
                                                      </div>
                                                </div>
                                          );
                                    })}
                              </div>
                        </main>
                        <footer className="h-14 bg-gray-900 border-t border-gray-800 flex items-center justify-center shrink-0 gap-4">
                              <button onClick={() => window.print()} className="px-6 py-2 bg-slate-700 text-white rounded font-bold flex items-center gap-2 hover:bg-slate-600">
                                    <CdiIcon name="printer" size={18} /> {t('cdi.imprimir.lista')}
                              </button>
                              <button onClick={() => setEmergency(false)} className="px-6 py-2 bg-red-600 text-white rounded font-bold flex items-center gap-2 hover:bg-red-500">
                                    <CdiIcon name="shield-off" size={18} /> {t('cdi.urgencia.desativar')}
                              </button>
                        </footer>
                  </div>
            );
      }

      // NORMAL MODE
      return (
            <div className="h-full flex flex-col bg-slate-100">
                  <style>{cdiStyles}</style>

                  {toast && <CdiToast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                  {/* CDI Header */}
                  <header className="h-12 bg-white border-b flex items-center justify-between px-5 shrink-0">
                        <div className="flex items-center gap-3">
                              <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-blue-600 text-sm font-medium">
                                    <CdiIcon name="arrow-left" size={18} /> {t('header.dashboard')}
                              </button>
                              <div className="w-px h-6 bg-slate-200"></div>
                              <div className="w-7 h-7 bg-blue-600 text-white rounded flex items-center justify-center text-xs font-bold">CDI</div>
                              <span className="font-semibold text-slate-700">{t('cdi.marca')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                              <CdiClock />
                              {/* ⚠️ Pastilha, e não bloco. O painel fixo custava 256 dos
                                  761 px da tela (medido, com 31 presenças) e mostrava
                                  dois dos 31 nomes. Aqui custa ~32 px, o número fica
                                  à vista e a lista abre num clique de quem for agir.
                                  O componente é o mesmo; mudou o invólucro. */}
                              {/* ══ LA GRANDE ALERTE ══════════════════════════════════════
                ⚠️ Elle SIGNALE, elle ne bloque pas : pas de bouton « refuser »,
                pas de porte fermée. Le terminal a déjà ouvert (ADR-003) et ce
                qui se passe ensuite appartient à l'adulte présent.

                ⚠️ Elle ne dit JAMAIS pourquoi. Le motif d'une exclusion est une
                donnée sensible sur un mineur, lisible seulement avec la
                permission dédiée — et l'écran du CDI est visible depuis le
                comptoir, par d'autres élèves. Nom, classe, photo : de quoi
                reconnaître la personne, rien de plus.

                Fermeture explicite : elle attend un geste. Un compte à rebours
                ferait rater l'alerte à celui qui avait le dos tourné. */}
            {alerte && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-8 bg-black/50"
                        onClick={() => setAlerte(null)}>
                        <div className={`w-full max-w-2xl rounded-3xl border-4 shadow-2xl p-8 text-center ${
                              alerte.type === 'exclu'
                                    ? 'bg-red-50 border-red-600' : 'bg-amber-50 border-amber-500'}`}
                              onClick={e => e.stopPropagation()}>
                              {alerte.type === 'exclu' ? (
                                    <>
                                          <p className="text-4xl font-black text-red-700 mb-4">
                                                {alerte.porTurma ? t('cdi.exclu.titre.turma') : t('cdi.exclu.titre')}
                                          </p>
                                          <div className="flex items-center justify-center gap-5 mb-4">
                                                <PersonPhoto userId={alerte.student.id} nome={alerte.student.name}
                                                      className="w-28 h-28 rounded-2xl object-cover shadow-lg" alt="" />
                                                <div className="text-left">
                                                      <p className="text-3xl font-black text-red-900">{alerte.student.name}</p>
                                                      <p className="text-xl font-bold text-red-700">{alerte.student.class}</p>
                                                </div>
                                          </div>
                                          {/* ⚠️ La DATE, jamais le motif : elle donne une
                                              phrase a dire a l'enfant sans raconter
                                              la sanction a toute la file. */}
                                          {alerte.ate && (
                                                <p className="text-xl font-bold text-red-800 mb-2">
                                                      {t('cdi.exclu.ate', { data: alerte.ate })}
                                                </p>
                                          )}
                                          <p className="text-lg text-red-800">{t('cdi.exclu.note')}</p>
                                    </>
                              ) : (
                                    <>
                                          <p className="text-4xl font-black text-amber-800 mb-3">{t('cdi.complet.titre')}</p>
                                          <p className="text-2xl font-bold text-amber-900 mb-3">
                                                {t('cdi.complet.detail', { n: alerte.dedans, m: alerte.capacite })}
                                          </p>
                                          <p className="text-lg text-amber-800">{t('cdi.complet.note')}</p>
                                    </>
                              )}
                              {/* ⚠️ `autoFocus` : sans lui il faut la SOURIS pour
                                  fermer une modale qui bloque tout l'ecran, a un
                                  poste ou l'operateur a les deux mains sur le
                                  lecteur. Echap la ferme aussi. */}
                              <button type="button" autoFocus onClick={() => setAlerte(null)}
                                    className="mt-6 px-8 py-3 rounded-2xl bg-slate-800 text-white text-xl font-black">
                                    {t('cdi.alerte.compris')}
                              </button>
                        </div>
                  </div>
            )}

            <FinDeJourneeIndicador pointId="BIBLIO" cicloMs={CDI_POLL_MS} />
                              <button onClick={() => setModal('stats')} title={t('cdi.menu.estatisticas')} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="bar-chart-3" size={18} /></button>
                              <button onClick={() => setModal('students')} title={t('cdi.menu.base')} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="users" size={18} /></button>
                              <button onClick={() => setModal('history')} title={t('cdi.menu.historico')} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="history" size={18} /></button>
                              <button onClick={() => setModal('help')} title={t('cdi.menu.ajuda')} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="help-circle" size={18} /></button>
                              <button onClick={() => setLocked(true)} title={t('cdi.menu.travar')} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="lock" size={18} /></button>
                              <button onClick={() => setModal('settings')} title={t('cdi.cfg.titulo')} className="w-8 h-8 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"><CdiIcon name="settings" size={18} /></button>
                        </div>
                  </header>

                  {/* Main Split View */}
                  <main className="flex-1 flex overflow-hidden">
                        {/* Left Panel — Search & Students */}
                        <section className="w-1/2 bg-slate-50 border-r flex flex-col p-4">
                              <div className="relative mb-2">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><CdiIcon name="search" size={18} /></span>
                                    <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                                          className="w-full pl-10 pr-3 py-3 border-2 rounded-lg focus:border-blue-600 outline-none" placeholder={t('cdi.busca.exemplo')} />
                              </div>
                              <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                                    {Object.entries(classGroups).map(([level, cnt]) => (
                                          <button key={level} onClick={() => setClassFilter(classFilter === level ? null : level)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1
                  ${classFilter === level ? 'bg-blue-600 text-white' : 'bg-white border text-slate-600 hover:border-blue-600'}`}>
                                                {level === 'Tous' ? t('rap.filtro.todos') : level === 'Inconnu' ? t('cdi.nivel.desconhecido') : level} <span className="opacity-60">({cnt})</span>
                                          </button>
                                    ))}
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-1">
                                    {results.length === 0 ? (
                                          <div className="text-center text-slate-400 mt-10">
                                                <CdiIcon name="search" size={32} />
                                                <p className="mt-2">{query.length < 2 && !classFilter ? t('cdi.busca.digite') : t('poraluno.sem.resultado')}</p>
                                          </div>
                                    ) : results.map(s => {
                                          const isIn = presentStudents.has(s.id);
                                          return (
                                                <div key={s.id} onClick={() => togglePresence(s.id)}
                                                      className={`p-3 rounded-lg border flex justify-between items-center cursor-pointer ${flash.id === s.id ? (flash.type === 'in' ? 'flash-in' : 'flash-out') : ''} ${isIn ? 'bg-slate-100 opacity-50' : 'bg-white hover:border-blue-600'}`}>
                                                      <div>
                                                            <span className="font-medium text-slate-800">{s.name}</span>
                                                            <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{s.class}</span>
                                                      </div>
                                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isIn ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                            <CdiIcon name={isIn ? 'log-out' : 'log-in'} size={16} />
                                                      </div>
                                                </div>
                                          );
                                    })}
                              </div>
                        </section>

                        {/* Right Panel — Present Students */}
                        <section className="w-1/2 bg-white flex flex-col p-4">
                              <div className={`text-center mb-4 pb-4 border-b ${isFull ? 'bg-red-50 -mx-4 px-4 pt-4' : ''}`}>
                                    {isFull && <p className="text-red-600 text-sm font-semibold mb-1">{t('cdi.capacidade.max')}</p>}
                                    <div className={`text-5xl font-bold ${isFull ? 'text-red-600' : 'text-blue-600'}`}>{count}</div>
                                    <div className="text-slate-400 text-sm">/ {capacite}</div>
                                    <CdiBandeauEtat dedans={count} capacite={capacite} etat={cdiEtat} />
                                    {/* O que o número conta, dito na tela. Sem
                                        isto o contador excluiria pessoas em
                                        silêncio — e um número que esconde gente
                                        sem avisar é pior que um número errado. */}
                                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                                          <input
                                                type="checkbox"
                                                checked={incluirFuncionarios}
                                                onChange={e => aplicarIncluirFuncionarios(e.target.checked)}
                                                className="w-3.5 h-3.5 accent-blue-600"
                                          />
                                          {t('cdi.incluir.pessoal')}
                                    </label>
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-1">
                                    {!presentList.length ? (
                                          <div className="text-center text-slate-300 mt-10"><CdiIcon name="users" size={40} /><p className="mt-2">{t('cdi.vazio')}</p></div>
                                    ) : presentList.map(s => (
                                          <div key={s.id} className={`p-3 bg-slate-50 rounded-lg flex justify-between items-center group ${flash.id === s.id && flash.type === 'out' ? 'flash-out' : ''}`}>
                                                <div className="flex items-center gap-3">
                                                      {/* Retrato quando há; a inicial em círculo azul
                                                          continua sendo a queda — é o que o CDI sempre
                                                          mostrou, e funciona sem rede (risco R1). */}
                                                      <PersonPhoto userId={s.id} nome={s.name}
                                                            className="w-10 h-10 rounded-full object-cover bg-blue-600 shrink-0" />
                                                      <div><div className="font-semibold text-slate-800">{s.name}</div><div className="text-xs text-slate-400">{s.class}</div></div>
                                                </div>
                                                <button onClick={() => togglePresence(s.id)} className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100">
                                                      <CdiIcon name="x" size={18} />
                                                </button>
                                          </div>
                                    ))}
                              </div>
                        </section>
                  </main>

                  {/* Footer */}
                  <footer className="h-14 bg-white border-t flex items-center justify-between px-5 shrink-0">
                        <div className="flex flex-col text-xs text-slate-400">
                              <span>{t('cdi.rodape.direitos')}</span>
                              <span>{t('cdi.rodape.dev.a')} <span className="text-red-500">❤️</span> {t('cdi.rodape.dev.b')} <a href="https://www.sammagbo.com" target="_blank" rel="noopener noreferrer" className="font-bold text-slate-600 hover:text-blue-600 hover:underline">Magbo Studio</a></span>
                        </div>
                        <button onClick={() => setEmergency(true)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                              <CdiIcon name="shield-alert" size={16} /> <span className="font-semibold">{t('cdi.urgencia')}</span>
                        </button>
                  </footer>

                  {/* Modals */}
                  <CdiSettingsModal open={modal === 'settings'} onClose={() => setModal(null)} onImport={handleImport}
                        onRestore={async (data) => {
                              await CdiBackend.restore(data);
                              const { students: restored, logs } = await CdiBackend.getSnapshot();
                              bumpMutation();
                              setStudents(restored.map(mapToView)); // FIX: Map to view format
                              setPresentStudents(new Set(restored.filter(s => s.present).map(s => s.id)));
                              setLogs(logs);
                        }}
                        onExport={() => exportBackup()}
                        count={students.length} muted={muted} setMuted={setMuted} pin={pin} setPin={setPin}
                        encryptBackup={encryptBackup} setEncryptBackup={setEncryptBackup}
                        backupTime={backupTime} setBackupTime={setBackupTime}
                        students={students} presentStudents={presentStudents} logs={logs} />
                  <CdiHistoryModal open={modal === 'history'} onClose={() => setModal(null)} logs={logs} students={students} />
                  <CdiStatsModal open={modal === 'stats'} onClose={() => setModal(null)} logs={logs} students={students} />
                  <CdiStudentManagerModal open={modal === 'students'} onClose={() => setModal(null)} students={students} setStudents={setStudents} setToast={setToast} />
                  <CdiHelpModal open={modal === 'help'} onClose={() => setModal(null)} />
            </div>
      );
}
