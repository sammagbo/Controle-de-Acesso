// =====================================================================
// CDI Stats Dashboard Modal
// =====================================================================

function CdiStatsModal({ open, onClose, logs, students }) {
      const [timeRange, setTimeRange] = React.useState('week');
      const [showReport, setShowReport] = React.useState(false);

      const filteredLogs = React.useMemo(() => {
            const now = new Date();
            const cutoff = timeRange === 'week'
                  ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                  : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return logs.filter(l => l.timestamp >= cutoff.getTime());
      }, [logs, timeRange]);

      const hourCounts = React.useMemo(() => {
            const counts = {};
            filteredLogs.filter(l => l.action === 'IN').forEach(l => {
                  const h = new Date(l.timestamp).getHours();
                  counts[h] = (counts[h] || 0) + 1;
            });
            return counts;
      }, [filteredLogs]);
      const maxHour = Math.max(...Object.values(hourCounts), 1);

      const dayCounts = React.useMemo(() => {
            const days = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            filteredLogs.filter(l => l.action === 'IN').forEach(l => {
                  const d = new Date(l.timestamp).getDay();
                  if (d >= 1 && d <= 5) days[d]++;
            });
            return days;
      }, [filteredLogs]);
      const maxDay = Math.max(...Object.values(dayCounts), 1);
      const dayNames = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven' };

      const classDistribution = React.useMemo(() => {
            const counts = {};
            filteredLogs.filter(l => l.action === 'IN').forEach(l => {
                  const s = students.find(st => st.id === l.studentId);
                  if (s) {
                        const level = (s.class && typeof s.class === 'string') ? s.class.split(' ')[0] : 'Inconnu';
                        counts[level] = (counts[level] || 0) + 1;
                  }
            });
            const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
            return Object.entries(counts)
                  .map(([name, count]) => ({ name, count, percent: Math.round(count / total * 100) }))
                  .sort((a, b) => b.count - a.count);
      }, [filteredLogs, students]);

      const uniqueVisits = new Set(filteredLogs.map(l => l.studentId)).size;
      const totalVisits = filteredLogs.filter(l => l.action === 'IN').length;

      const avgDuration = React.useMemo(() => {
            const visits = {};
            filteredLogs.forEach(l => {
                  if (!visits[l.studentId]) visits[l.studentId] = [];
                  visits[l.studentId].push(l);
            });
            let totalDur = 0, count = 0;
            Object.values(visits).forEach(v => {
                  for (let i = 0; i < v.length - 1; i += 2) {
                        if (v[i].action === 'IN' && v[i + 1]?.action === 'OUT') {
                              totalDur += v[i + 1].timestamp - v[i].timestamp;
                              count++;
                        }
                  }
            });
            return count > 0 ? Math.round(totalDur / count / 60000) : 0;
      }, [filteredLogs]);

      const topClass = classDistribution[0]?.name || '-';
      const peakDayIndex = Object.keys(dayCounts).reduce((a, b) => dayCounts[a] > dayCounts[b] ? a : b, 1);
      const peakDayName = dayNames[peakDayIndex];
      const peakHourTime = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b, 8);
      const classColors = ['#0055FF', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];

      if (!open) return null;

      const generateReport = () => {
            setShowReport(true);
            setTimeout(() => { window.print(); setShowReport(false); }, 100);
      };

      if (showReport) {
            return (
                  <div className="fixed inset-0 bg-white z-50 p-8 overflow-auto" id="cdi-report-view">
                        <style>{`@media print { body * { visibility: hidden; } #cdi-report-view, #cdi-report-view * { visibility: visible; } #cdi-report-view { position: absolute; left: 0; top: 0; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }`}</style>
                        <div className="max-w-3xl mx-auto">
                              <header className="text-center border-b-2 pb-4 mb-6">
                                    <h1 className="text-2xl font-bold">CDI - Rapport de Fréquentation</h1>
                                    <p className="text-gray-600">{timeRange === 'week' ? 'Rapport Hebdomadaire' : 'Rapport Mensuel'}</p>
                                    <p className="text-sm text-gray-500">Généré le {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                              </header>
                              <section className="mb-6">
                                    <h2 className="font-bold text-lg border-b pb-2 mb-3">Résumé des Visites</h2>
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                          <div className="border rounded p-3"><div className="text-2xl font-bold">{totalVisits}</div><div className="text-sm text-gray-600">Entrées totales</div></div>
                                          <div className="border rounded p-3"><div className="text-2xl font-bold">{uniqueVisits}</div><div className="text-sm text-gray-600">Visiteurs uniques</div></div>
                                          <div className="border rounded p-3"><div className="text-2xl font-bold">{avgDuration} min</div><div className="text-sm text-gray-600">Durée moyenne</div></div>
                                    </div>
                              </section>
                              <section className="mb-6 bg-slate-50 p-4 rounded border">
                                    <h2 className="font-bold text-lg border-b pb-2 mb-2">Analyse de l'Activité</h2>
                                    <p className="text-slate-800">
                                          Le pic d'affluence est observé le <strong>{peakDayName}</strong> vers <strong>{peakHourTime}h</strong>.
                                          Les élèves de <strong>{topClass}</strong> sont les plus fréquents au CDI.
                                    </p>
                              </section>
                              <section className="mb-6">
                                    <h2 className="font-bold text-lg border-b pb-2 mb-3">Fréquentation par Jour</h2>
                                    <div className="flex items-end gap-4 h-40 border-b pb-2 mb-4">
                                          {Object.entries(dayNames).map(([d, name]) => (
                                                <div key={d} className="flex-1 flex flex-col items-center">
                                                      <div className="text-xs font-bold text-slate-600 mb-1">{dayCounts[d] || 0}</div>
                                                      <div className="w-full bg-edu-blue rounded-t border border-blue-700" style={{ height: `${(dayCounts[d] || 0) / maxDay * 100}%`, minHeight: '2px', backgroundColor: '#0055FF' }}></div>
                                                      <span className="text-sm text-slate-800 mt-1 font-medium">{name}</span>
                                                </div>
                                          ))}
                                    </div>
                              </section>
                              <section className="mb-6">
                                    <h2 className="font-bold text-lg border-b pb-2 mb-3">Répartition par Niveau</h2>
                                    <div className="space-y-4">
                                          {classDistribution.map((c, i) => (
                                                <div key={c.name} className="flex items-center gap-3">
                                                      <span className="w-24 text-sm font-bold text-slate-800">{c.name}</span>
                                                      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden border border-slate-300">
                                                            <div className="h-full rounded-full" style={{ width: `${c.percent}%`, backgroundColor: classColors[i % classColors.length], printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}></div>
                                                      </div>
                                                      <span className="w-20 text-sm text-right text-slate-800 font-medium">{c.percent}% ({c.count})</span>
                                                </div>
                                          ))}
                                    </div>
                              </section>
                              <section className="mt-12 pt-8 border-t">
                                    <div className="flex justify-between">
                                          <div><p className="text-sm text-gray-500">Signature du Documentaliste:</p><div className="mt-8 border-b w-48"></div></div>
                                          <div><p className="text-sm text-gray-500">Date:</p><div className="mt-8 border-b w-32"></div></div>
                                    </div>
                              </section>
                        </div>
                        <button onClick={() => setShowReport(false)} className="no-print fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded">Fermer</button>
                  </div>
            );
      }

      return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
                  <div className="bg-white rounded-xl w-full max-w-3xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                              <h2 className="font-bold text-xl flex items-center gap-2"><CdiIcon name="bar-chart-3" size={24} /> Dashboard & Rapports</h2>
                              <button onClick={onClose}><CdiIcon name="x" size={24} /></button>
                        </div>
                        <div className="flex gap-2 mb-6">
                              <button onClick={() => setTimeRange('week')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${timeRange === 'week' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Cette Semaine</button>
                              <button onClick={() => setTimeRange('month')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${timeRange === 'month' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Ce Mois</button>
                        </div>
                        {filteredLogs.length === 0 ? (
                              <div className="text-center py-12 text-slate-400">
                                    <CdiIcon name="calendar-x" size={48} />
                                    <p className="mt-4">Pas de données pour cette période</p>
                              </div>
                        ) : (
                              <React.Fragment>
                                    <div className="grid grid-cols-4 gap-3 mb-6">
                                          <div className="bg-blue-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-blue-600">{totalVisits}</div><div className="text-xs text-slate-500">Entrées</div></div>
                                          <div className="bg-indigo-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-indigo-600">{uniqueVisits}</div><div className="text-xs text-slate-500">Uniques</div></div>
                                          <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-green-600">{avgDuration}m</div><div className="text-xs text-slate-500">Durée moy.</div></div>
                                          <div className="bg-purple-50 rounded-xl p-3 text-center"><div className="text-lg font-bold text-purple-600">{topClass}</div><div className="text-xs text-slate-500">Top classe</div></div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                                          <div className="bg-amber-100 p-2 rounded-full text-amber-600"><CdiIcon name="lightbulb" size={20} /></div>
                                          <div>
                                                <h3 className="font-bold text-amber-800 text-sm mb-1">Analyse de l'Activité</h3>
                                                <p className="text-sm text-amber-900">
                                                      Le pic d'affluence est observé le <strong>{peakDayName}</strong> vers <strong>{peakHourTime}h</strong>.
                                                      Les élèves de <strong>{topClass}</strong> sont les plus fréquents au CDI.
                                                </p>
                                          </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                          <div className="bg-slate-50 rounded-xl p-4">
                                                <h3 className="font-semibold mb-3 text-sm">Fréquentation par Jour</h3>
                                                <div className="flex items-end gap-2 h-28">
                                                      {Object.entries(dayNames).map(([d, name]) => (
                                                            <div key={d} className="flex-1 flex flex-col items-center">
                                                                  <div className="text-xs font-medium text-slate-600 mb-1">{dayCounts[d] || 0}</div>
                                                                  <div className="w-full rounded-t transition-all" style={{ height: `${(dayCounts[d] || 0) / maxDay * 80}%`, minHeight: dayCounts[d] ? '8px' : '2px', opacity: dayCounts[d] ? 1 : 0.2, backgroundColor: '#0055FF' }}></div>
                                                                  <span className="text-xs text-slate-500 mt-1">{name}</span>
                                                            </div>
                                                      ))}
                                                </div>
                                          </div>
                                          <div className="bg-slate-50 rounded-xl p-4">
                                                <h3 className="font-semibold mb-3 text-sm">Affluence par Heure</h3>
                                                <div className="flex items-end gap-1 h-28">
                                                      {Array.from({ length: 10 }, (_, i) => i + 8).map(h => (
                                                            <div key={h} className="flex-1 flex flex-col items-center">
                                                                  <div className="w-full bg-green-500 rounded-t transition-all" style={{ height: `${(hourCounts[h] || 0) / maxHour * 80}%`, minHeight: hourCounts[h] ? '4px' : '2px', opacity: hourCounts[h] ? 1 : 0.2 }}></div>
                                                                  <span className="text-xs text-slate-400 mt-1">{h}h</span>
                                                            </div>
                                                      ))}
                                                </div>
                                          </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 mb-6">
                                          <h3 className="font-semibold mb-3 text-sm">Répartition par Niveau</h3>
                                          {classDistribution.length === 0 ? (
                                                <p className="text-slate-400 text-sm">Aucune donnée</p>
                                          ) : (
                                                <div className="space-y-2">
                                                      {classDistribution.map((c, i) => (
                                                            <div key={c.name} className="flex items-center gap-3">
                                                                  <span className="w-20 text-sm font-medium text-slate-700">{c.name}</span>
                                                                  <div className="flex-1 h-6 bg-slate-200 rounded-full overflow-hidden">
                                                                        <div className="h-full rounded-full transition-all" style={{ width: `${c.percent}%`, backgroundColor: classColors[i % classColors.length] }}></div>
                                                                  </div>
                                                                  <span className="w-16 text-sm text-right text-slate-600">{c.percent}% ({c.count})</span>
                                                            </div>
                                                      ))}
                                                </div>
                                          )}
                                    </div>
                                    <button onClick={generateReport} className="w-full py-3 bg-slate-800 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-slate-700">
                                          <CdiIcon name="file-text" size={20} /> Générer Rapport (PDF Print)
                                    </button>
                              </React.Fragment>
                        )}
                  </div>
            </div>
      );
}
