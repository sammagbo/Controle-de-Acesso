// =====================================================================
// MEAL ENTITLEMENT MANAGEMENT
// =====================================================================

function MealEntitlementManagement() {
      const [searchTerm, setSearchTerm] = React.useState('');
      const [filterTurma, setFilterTurma] = React.useState('');
      const [filterStatus, setFilterStatus] = React.useState('');
      const [users, setUsers] = React.useState([]);
      const [entitlements, setEntitlements] = React.useState({});
      const [summary, setSummary] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [selectedUserHistory, setSelectedUserHistory] = React.useState(null);
      
      const canEdit = window.auth?.isAdmin() || false; // Simple check, full validation on backend

      // Carregar cache de usuários
      React.useEffect(() => {
            const handleUserCache = () => {
                  // Triggers re-render if needed, but we pull directly from window.userCache.all()
            };
            window.addEventListener('user-cache-updated', handleUserCache);
            return () => window.removeEventListener('user-cache-updated', handleUserCache);
      }, []);

      const loadData = async () => {
            setLoading(true);
            setError('');
            try {
                  const data = await window.api.getMealEntitlements({ 
                        q: searchTerm, 
                        turma: filterTurma, 
                        status: filterStatus,
                        size: 100 // Limite de visualização para não travar UI, ou implementamos paginação simples
                  });
                  
                  const entMap = {};
                  data.content.forEach(ent => {
                        entMap[ent.userId] = ent;
                  });
                  setEntitlements(entMap);

                  const sum = await window.api.getMealEntitlementSummary();
                  setSummary(sum);
            } catch (err) {
                  setError(err.message || 'Erreur lors du chargement des données.');
            } finally {
                  setLoading(false);
            }
      };

      React.useEffect(() => {
            // Debounce na busca
            const delay = setTimeout(() => {
                  loadData();
            }, 500);
            return () => clearTimeout(delay);
      }, [searchTerm, filterTurma, filterStatus]);

      const handleToggleStatus = async (userId, currentStatus) => {
            if (!canEdit) {
                  alert("Vous n'avez pas l'autorisation de modifier ce droit.");
                  return;
            }
            
            const newStatus = currentStatus === 'AUTHORIZED' ? 'NOT_AUTHORIZED' : 'AUTHORIZED';
            const payload = {
                  status: newStatus,
                  validUntil: null, // Pode ser adicionado futuramente
                  note: 'Modifié via interface cantine'
            };

            try {
                  const updated = await window.api.putMealEntitlement(userId, payload);
                  setEntitlements(prev => ({ ...prev, [userId]: updated }));
                  // Atualizar resumo
                  const sum = await window.api.getMealEntitlementSummary();
                  setSummary(sum);
            } catch (err) {
                  alert(err.message);
            }
      };

      // ─────────────────────────────────────────────────────────────
      // IMPORTAÇÃO EXCEL (BULK)
      // ─────────────────────────────────────────────────────────────
      const fileInputRef = React.useRef(null);
      const [importing, setImporting] = React.useState(false);

      const handleImportClick = () => {
            if (fileInputRef.current) fileInputRef.current.click();
      };

      const handleFileChange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            setImporting(true);
            try {
                  if (!window.XLSX) throw new Error("La bibliothèque XLSX n'est pas chargée.");

                  const data = await file.arrayBuffer();
                  const workbook = window.XLSX.read(data, { type: 'array' });
                  const firstSheetName = workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[firstSheetName];
                  
                  // raw: false força tudo a ser lido como string formatada no excel (preserva 000 à esquerda)
                  const rows = window.XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null });
                  
                  if (rows.length === 0) throw new Error("Le fichier est vide.");

                  // Mapear para DTO do backend
                  const items = rows.map(r => {
                        // O excel pode ter colunas variadas, vamos tentar encontrar a matrícula ou id
                        const matricula = r['Matricule'] || r['Matricula'] || r['ID'] || r['employeeNo'] || Object.values(r)[0];
                        // Default AUTHORIZED é INTENCIONAL (D5): o bulk É a lista de autorizados da direção.
                        const statusStr = (r['Statut'] || r['Status'] || 'AUTHORIZED').toUpperCase();
                        let status = 'AUTHORIZED';
                        if (statusStr.includes('NOT') || statusStr.includes('NON') || statusStr.includes('N')) status = 'NOT_AUTHORIZED';
                        
                        return {
                              userId: matricula ? matricula.toString().trim() : null,
                              status: status,
                              note: "Import en masse"
                        };
                  }).filter(i => i.userId);

                  if (items.length === 0) throw new Error("Aucune donnée valide trouvée.");

                  const result = await window.api.postMealEntitlementBulk(items, true); // true = overwrite
                  alert(`Import terminé!\nReçus: ${result.totalRecebido}\nCréés: ${result.totalCriado}\nMis à jour: ${result.totalAtualizado}\nIgnorés: ${result.totalIgnorado}\nErreurs: ${result.totalFalhas}`);
                  loadData();

            } catch (err) {
                  alert("Erreur d'importation: " + err.message);
            } finally {
                  setImporting(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
            }
      };

      // Se API já retornou algo, usamos as chaves da API para ter a página correta,
      // ou misturamos com cache local para mostrar usuários que ainda não tem registro de entitlement (fallback para default).
      // Para manter simples e robusto: exibimos a lista da API, enriquecida com o userCache.
      const apiUserIds = Object.keys(entitlements);
      const mergedList = apiUserIds.map(uid => {
            const ent = entitlements[uid];
            const cachedUser = window.userCache?.byId(uid) || { nome: uid, turma: 'Inconnu', foto_url: window.localAvatar(uid) };
            return {
                  ...cachedUser,
                  userId: uid, // explícito: o userCache usa `id`, não `userId` (toggle/histórico/key dependem disto)
                  entitlement: ent
            };
      });

      // Se não há pesquisa ativa na API (ou é vazia), e temos cache local:
      // O ideal seria que a API retornasse TODOS os alunos daquela turma, mesmo sem entitlement.
      // O backend meal-entitlements/ faz join com UserEntity? Se sim, a API já traz.
      // Vamos assumir que `mergedList` é a fonte da verdade da view, 
      // pois os filtros de turma e searchTerm são passados para a API.

      return (
            <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                              <h1 className="text-2xl font-black text-navy-800">Gestion Cantine</h1>
                              <p className="text-sm text-slate-500">Gérez les droits de repas des étudiants.</p>
                        </div>

                        {canEdit && (
                              <div className="flex gap-2">
                                    <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                                    <button onClick={handleImportClick} disabled={importing} className="btn bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2">
                                          <LucideIcon name={importing ? "loader-2" : "upload"} size={18} className={importing ? "animate-spin" : ""} />
                                          {importing ? "Importation..." : "Importer Liste (XLSX)"}
                                    </button>
                              </div>
                        )}
                  </div>

                  {/* Estatísticas */}
                  {summary && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Autorisés</p>
                                    <p className="text-2xl font-black text-success-600 mt-2">{summary.totalAuthorized}</p>
                              </div>
                              <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col justify-between">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total Non Autorisés</p>
                                    <p className="text-2xl font-black text-danger-600 mt-2">{summary.totalNotAuthorized}</p>
                              </div>
                        </div>
                  )}

                  {/* Filtros */}
                  <div className="bg-white p-4 rounded-2xl border border-soft-200 shadow-sm flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                              <LucideIcon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                    type="text" 
                                    placeholder="Rechercher par nom ou matricule..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-medium"
                              />
                        </div>
                        <div className="w-full md:w-48">
                              <select 
                                    value={filterTurma}
                                    onChange={e => setFilterTurma(e.target.value)}
                                    className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-medium"
                              >
                                    <option value="">Toutes les classes</option>
                                    <option value="A1">A1</option>
                                    <option value="A2">A2</option>
                                    <option value="B1">B1</option>
                                    <option value="B2">B2</option>
                              </select>
                        </div>
                        <div className="w-full md:w-48">
                              <select 
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                    className="w-full px-4 py-2 bg-soft-50 border border-soft-200 rounded-xl focus:ring-2 focus:ring-navy-500 text-sm font-medium"
                              >
                                    <option value="">Tous les statuts</option>
                                    <option value="AUTHORIZED">Autorisé</option>
                                    <option value="NOT_AUTHORIZED">Non autorisé</option>
                              </select>
                        </div>
                  </div>

                  {/* Lista */}
                  <div className="bg-white rounded-2xl border border-soft-200 shadow-sm overflow-hidden">
                        {loading ? (
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LucideIcon name="loader-2" size={24} className="animate-spin mb-2" />
                                    <p className="text-sm">Chargement des droits...</p>
                              </div>
                        ) : error ? (
                              <div className="flex flex-col items-center justify-center py-12 text-danger-500">
                                    <LucideIcon name="alert-circle" size={32} className="mb-2" />
                                    <p className="text-sm">{error}</p>
                              </div>
                        ) : mergedList.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LucideIcon name="search-x" size={32} className="mb-2 text-slate-300" />
                                    <p className="text-sm">Aucun résultat trouvé.</p>
                              </div>
                        ) : (
                              <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                          <thead>
                                                <tr className="bg-soft-50 border-b border-soft-200">
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Étudiant</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Classe</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Statut Droit</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Dernière Modif.</th>
                                                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                                </tr>
                                          </thead>
                                          <tbody className="divide-y divide-soft-100">
                                                {mergedList.map(item => {
                                                      const ent = item.entitlement;
                                                      const status = ent?.status || 'PENDING'; // Default: sem dado = En attente (nunca "negado")
                                                      const isAuth = status === 'AUTHORIZED';
                                                      const isPending = status === 'PENDING';
                                                      
                                                      return (
                                                            <tr key={item.userId} className="hover:bg-soft-50/50 transition-colors">
                                                                  <td className="px-6 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                              <img src={item.foto_url} className="w-8 h-8 rounded-full border border-slate-200" />
                                                                              <div>
                                                                                    <div className="text-sm font-bold text-navy-800">{item.nome}</div>
                                                                                    <div className="text-[10px] font-mono text-slate-400">{item.userId}</div>
                                                                              </div>
                                                                        </div>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{item.turma}</span>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        <button 
                                                                              onClick={() => handleToggleStatus(item.userId, status)}
                                                                              disabled={!canEdit}
                                                                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                                                                                    isAuth
                                                                                          ? 'bg-success-100 text-success-700 hover:bg-success-200'
                                                                                          : isPending
                                                                                                ? 'bg-warning-100 text-warning-600 hover:opacity-80'
                                                                                                : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                                                                              } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        >
                                                                              <div className={`w-1.5 h-1.5 rounded-full ${isAuth ? 'bg-success-500' : isPending ? 'bg-warning-500' : 'bg-danger-500'}`}></div>
                                                                              {window.ENTITLEMENT_STATUS_LABELS?.[status] || status}
                                                                        </button>
                                                                  </td>
                                                                  <td className="px-6 py-3">
                                                                        {ent?.updatedAt ? (
                                                                              <div className="text-xs text-slate-500">
                                                                                    {new Date(ent.updatedAt).toLocaleDateString('fr-FR')}
                                                                                    <div className="text-[10px] text-slate-400">par {ent.updatedBy || 'API'}</div>
                                                                              </div>
                                                                        ) : (
                                                                              <span className="text-xs text-slate-400">—</span>
                                                                        )}
                                                                  </td>
                                                                  <td className="px-6 py-3 text-right">
                                                                        <button 
                                                                              onClick={() => setSelectedUserHistory(item.userId)}
                                                                              className="p-1.5 text-slate-400 hover:text-navy-600 hover:bg-soft-100 rounded-lg transition-colors"
                                                                              title="Voir l'historique"
                                                                        >
                                                                              <LucideIcon name="history" size={18} />
                                                                        </button>
                                                                  </td>
                                                            </tr>
                                                      );
                                                })}
                                          </tbody>
                                    </table>
                              </div>
                        )}
                  </div>

                  {selectedUserHistory && (
                        <MealEntitlementHistoryModal 
                              userId={selectedUserHistory} 
                              onClose={() => setSelectedUserHistory(null)} 
                        />
                  )}
            </div>
      );
}
