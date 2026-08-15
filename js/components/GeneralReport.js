// =====================================================================
// RAPPORT GÉNÉRAL — consolidated view across all areas (admin only)
// 3 tabs: Vue d'ensemble (KPIs by area) | Par élève | Journal (all logs)
// =====================================================================

// ── Journal Tab ──────────────────────────────────────────────────────
// `active` = esta aba está visível. O Rapport monta as TRÊS abas de uma vez
// (as inativas ficam escondidas por CSS), então sem esse sinal o Journal não
// tem como saber que voltou a ser olhado.
function JournalTab({ active = true }) {
    const t = useI18n();
    const locale = useLocale();
    const todayStr = () => new Date().toISOString().slice(0, 10);
    const [dateFrom, setDateFrom] = React.useState(todayStr());
    const [dateTo, setDateTo] = React.useState(todayStr());
    const [pointId, setPointId] = React.useState('');
    const [action, setAction] = React.useState('');
    // Vazio = TUDO. O Journal é a visão de auditoria: o tipo é uma lente que o
    // operador escolhe, nunca um recorte silencioso.
    const [tipo, setTipo] = React.useState('');
    // Idem: vazio = TUDO. O Journal mostra a repetição de quem está postado num
    // ponto como mostra qualquer outra linha — é a única tela que nunca a
    // esconde. A lente serve para conferir quanto ruído a marcação absorveu.
    const [repeticoes, setRepeticoes] = React.useState('');
    const [aluno, setAluno] = React.useState('');
    const [alunoQuery, setAlunoQuery] = React.useState('');
    const [logs, setLogs] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [classe, setClasse] = React.useState('');
    const [sortDir, setSortDir] = React.useState('desc');
    const [page, setPage] = React.useState(1);
    const [cacheVersion, setCacheVersion] = React.useState(0);
    const PAGE_SIZE = 50;
    const REFRESH_MS = 30000;

    // Debounce de 250 ms no campo Élève — mesma convenção da busca de pessoas.
    React.useEffect(() => {
        const tid = setTimeout(() => setAlunoQuery(aluno.trim()), 250);
        return () => clearTimeout(tid);
    }, [aluno]);

    // O userCache carrega de forma assíncrona no startup. Sem escutar o evento,
    // uma tela aberta antes de ele chegar mostra matrícula crua na coluna Élève
    // e o filtro de Classe não acha nada — sem nenhum sinal de que falta dado.
    React.useEffect(() => {
        const onCache = () => setCacheVersion(v => v + 1);
        window.addEventListener('user-cache-updated', onCache);
        return () => window.removeEventListener('user-cache-updated', onCache);
    }, []);

    // Total do BANCO para os mesmos filtros — a lista tem teto de 500 e o
    // cabeçalho não pode medi-la (612 no banco, "500" na tela, 12/08/2026).
    // null = desconhecido (endpoint fora): o cabeçalho volta ao comportamento
    // antigo em vez de mentir um zero.
    const [totalServidor, setTotalServidor] = React.useState(null);

    const load = React.useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const [data, total] = await Promise.all([
                window.api.fetchAllLogs({
                    dateFrom, dateTo, pointId, action, tipo, repeticoes,
                    eleve: alunoQuery, limit: 500
                }),
                fetchLogsCount({
                    dateFrom, dateTo, pointId, action, tipo, repeticoes,
                    eleve: alunoQuery
                })
            ]);
            setLogs(Array.isArray(data) ? data : []);
            setTotalServidor(total);
            setError(null);
        } catch (e) {
            // Numa atualização silenciosa, mantém as linhas que já estavam na
            // tela: apagar tudo por causa de uma falha de rede passageira é
            // trocar dado velho por dado nenhum.
            if (!silent) setLogs([]);
            setError(t('journal.erro.carregar'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [dateFrom, dateTo, pointId, action, tipo, repeticoes, alunoQuery]);

    // ⚠️ REGRESSÃO DE 03/08/2026 — não voltar a carregar só na montagem.
    // O Journal buscava UMA vez, quando a tela do Rapport era aberta, e nunca
    // mais: nem ao trocar de aba, nem com o tempo. A tela foi aberta logo
    // depois do primeiro movimento do dia e às 13:02 ainda mostrava aquele
    // único movimento, com a "Vue d'ensemble" ao lado contando os 5 certos.
    // Sub-reportar é pior que falhar: a tela parece funcionar.
    // Recarrega ao ficar visível e vai se atualizando enquanto for olhada;
    // parado quando escondida, para as três abas não martelarem o backend.
    React.useEffect(() => {
        if (!active) return undefined;
        load();
        const id = setInterval(() => load({ silent: true }), REFRESH_MS);
        return () => clearInterval(id);
    }, [active, load]);

    // O filtro de ÉLÈVE é do SERVIDOR (nome OU matrícula, sobre o período
    // inteiro). Refiltrar aqui apagaria justamente as linhas que o servidor
    // casou pelo nome de um aluno ausente do cache local.
    const filtered = React.useMemo(() => {
        const qC = classe.trim().toLowerCase();
        if (!qC) return logs;
        return logs.filter(l => {
            const turma = (window.userCache?.byId(l.userId)?.turma || '').toLowerCase();
            return turma.includes(qC);
        });
    }, [logs, classe, cacheVersion]);

    const sorted = React.useMemo(() => {
        const arr = [...filtered];
        arr.sort((a, b) => sortDir === 'desc'
            ? new Date(b.timestamp) - new Date(a.timestamp)
            : new Date(a.timestamp) - new Date(b.timestamp));
        return arr;
    }, [filtered, sortDir]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const pageRows = React.useMemo(
        () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [sorted, page]
    );
    // Volta à página 1 quando o OPERADOR mexe num filtro — e não a cada
    // atualização automática, o que arrancaria o leitor da página em que está
    // a cada 30 s (`filtered` é um array novo a cada carga).
    React.useEffect(() => {
        setPage(1);
    }, [dateFrom, dateTo, pointId, action, tipo, repeticoes, alunoQuery, classe, sortDir]);
    // Uma atualização pode encurtar a lista com o leitor numa página alta.
    React.useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    // Nome do ponto, nunca o código seco — pointLabel (js/data/constants.js)
    // resolve pelo ACCESS_POINTS e rotula o desconhecido como "Point X".
    const pointName = (id) => pointLabel(id);

    const fmtDateTime = (ts) => {
        const d = new Date(safeDateParse(ts));
        return d.toLocaleDateString(locale) + ' ' + formatTime(d);
    };

    const exportCSV = () => {
        // A coluna Marque vai junto: o CSV é a cópia que sai da tela e circula
        // por e-mail, e sem ela quem recebe conta as linhas de posto fixo como
        // movimentos comuns — a divergência com o painel reapareceria fora do
        // sistema, onde ninguém pode investigá-la.
        const header = 'Date,ID,Nom,Classe,Zone,Action,Marque\n';
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = filtered.map(l => {
            const u = window.userCache?.byId(l.userId);
            // A coluna Nom vinha VAZIA quando o cache não tinha a pessoa, e o
            // CSV é a cópia que circula por e-mail: quem recebia via só a
            // matrícula na coluna ID e nada na que deveria dizer quem é.
            const quem = window.MagboIdentity.resolver(
                { pessoa: u, userId: l.userId }, { lang: 'fr' });
            return [
                esc(fmtDateTime(l.timestamp)), esc(quem.matricula || l.userId), esc(quem.nome),
                esc(u?.turma || u?.departamento || ''), esc(pointName(l.pointId)), esc(l.action),
                esc(l.flag || '')
            ].join(',');
        }).join('\n');
        const csv = '\uFEFF' + header + rows;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `journal-${dateFrom}_${dateTo}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const inputCls = 'px-3 py-2 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300';
    const points = typeof ACCESS_POINTS !== 'undefined' ? ACCESS_POINTS : [];

    return (
        <div>
            {/* ── Filtros ── */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('journal.filtro.de')}</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('journal.filtro.ate')}</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('journal.filtro.zona')}</label>
                    <select value={pointId} onChange={e => setPointId(e.target.value)} className={inputCls}>
                        <option value="">{t('rap.filtro.todas')}</option>
                        {points.filter(p => p.category !== 'monitor').map(p => (
                            <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('journal.filtro.acao')}</label>
                    <select value={action} onChange={e => setAction(e.target.value)} className={inputCls}>
                        <option value="">{t('rap.filtro.todas')}</option>
                        <option value="ENTRADA">{t('rap.col.entrada')}</option>
                        <option value="SAIDA">{t('rap.col.saida')}</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('comum.tipo')}</label>
                    <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
                        <option value="">{t('rap.filtro.todos')}</option>
                        <option value="ALUNO">{t('journal.tipo.alunos')}</option>
                        <option value="PROFESSOR">{t('journal.tipo.professores')}</option>
                        <option value="FUNCIONARIO">{t('journal.tipo.pessoal')}</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('setor.repeticoes')}</label>
                    <select
                        value={repeticoes}
                        onChange={e => setRepeticoes(e.target.value)}
                        title={t('journal.repeticoes.ajuda')}
                        className={inputCls}
                    >
                        <option value="">{t('rap.filtro.todos')}</option>
                        <option value="SANS">{t('journal.repeticoes.sem')}</option>
                        <option value="SEULEMENT">{t('journal.repeticoes.somente')}</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('comum.turma')}</label>
                    <input
                        type="text"
                        value={classe}
                        onChange={e => setClasse(e.target.value)}
                        placeholder={t('journal.turma.exemplo')}
                        className={inputCls + ' w-24'}
                    />
                </div>
                <div className="flex-1 min-w-[160px]">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{t('journal.filtro.pessoa')}</label>
                    <input
                        type="text"
                        value={aluno}
                        onChange={e => setAluno(e.target.value)}
                        placeholder={t('journal.filtro.pessoa.exemplo')}
                        className={inputCls + ' w-full'}
                    />
                </div>
                <button
                    onClick={exportCSV}
                    className="px-4 py-2 rounded-xl bg-success-500 text-white font-bold text-sm hover:bg-success-600 flex items-center gap-2"
                >
                    <LucideIcon name="download" size={16} /> CSV
                </button>
            </div>

            {error && (
                <div className="mb-3 flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-xl px-4 py-2.5">
                    <LucideIcon name="wifi-off" size={16} />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => load()} className="font-bold underline hover:no-underline">{t('acao.reessayer')}</button>
                </div>
            )}

            {/* ── Tabela ── */}
            <div className="border border-soft-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-soft-100 flex items-center justify-between">
                    {/* O total é do SERVIDOR. O filtro de Classe roda no
                        cliente (userCache), então com ele ativo o total do
                        banco não corresponde ao que está na tela — aí o
                        cabeçalho volta a contar as linhas visíveis, e diz. */}
                    <span className="text-sm font-bold text-navy-500">
                        {classe.trim()
                            ? t('journal.contagem.filtro', { n: filtered.length, total: logs.length })
                            : totalServidor != null && totalServidor > logs.length
                                ? t('journal.contagem.parcial', { total: totalServidor.toLocaleString(locale), n: logs.length })
                                : t('journal.contagem', { n: filtered.length })}
                    </span>
                    {loading && <span className="text-xs text-slate-400 flex items-center gap-1"><LucideIcon name="loader-2" size={12} className="animate-spin" /> {t('comum.carregando')}</span>}
                </div>
                <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-soft-50 sticky top-0 z-10">
                            <tr className="text-left text-xs font-bold text-slate-400 uppercase">
                                <th className="px-4 py-2">
                                    <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                                        className="flex items-center gap-1 uppercase font-bold hover:text-navy-500 transition-colors">
                                        {t('journal.col.datahora')}
                                        <LucideIcon name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
                                    </button>
                                </th>
                                {/* "Personne" e não "Élève": o filtro Type ao lado
                                    oferece Professeurs e Personnel, então esta
                                    lista contém servidores por construção. */}
                                <th className="px-4 py-2">{t('journal.filtro.pessoa')}</th>
                                <th className="px-4 py-2">{t('comum.turma')}</th>
                                <th className="px-4 py-2">{t('journal.filtro.zona')}</th>
                                <th className="px-4 py-2">{t('journal.filtro.acao')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-400">
                                        {t('journal.vazio')}
                                    </td>
                                </tr>
                            )}
                            {pageRows.map((l, i) => {
                                const u = window.userCache?.byId(l.userId);
                                // ⚠️ NUNCA a matrícula sozinha no lugar do nome.
                                // Era `{u?.nome || l.userId}`: com o cache ainda
                                // carregando, a coluna inteira virava 0003535 — e
                                // quem lê o Journal está justamente tentando saber
                                // QUEM passou. Agora vem a palavra, com o número
                                // ao lado como apoio.
                                const quem = window.MagboIdentity.resolver(
                                    { pessoa: u, userId: l.userId }, { lang: 'fr' });
                                const isEntrada = l.action === 'ENTRADA';
                                return (
                                    <tr key={l.id || i} className="border-b border-soft-50 hover:bg-soft-50/50 transition-colors">
                                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{fmtDateTime(l.timestamp)}</td>
                                        <td className="px-4 py-2 font-bold text-navy-500">
                                            <span className="flex items-center gap-2">
                                                {/* Retrato pequeno: no Journal o operador está
                                                    conferindo QUEM passou, e o nome sozinho não
                                                    distingue dois homônimos de turmas diferentes. */}
                                                <PersonPhoto userId={l.userId} nome={quem.nome} fotoUrl={u?.foto_url}
                                                    className="w-7 h-7 rounded-full object-cover bg-soft-100 shrink-0" />
                                                <span className="min-w-0">
                                                    <span className={`block truncate ${quem.reconhecido ? '' : 'italic text-slate-500'}`}>
                                                        {quem.nome}
                                                    </span>
                                                    {quem.matricula && (
                                                        <span className="block text-[10px] font-normal font-mono text-slate-400">
                                                            {quem.matricula}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </td>
                                        {/* Servidor não tem turma: cai para o
                                            departamento, que é o equivalente
                                            útil na coluna "Classe". */}
                                        <td className="px-4 py-2 text-slate-500">{u?.turma || u?.departamento || '—'}</td>
                                        <td className="px-4 py-2 text-slate-600">
                                            {pointName(l.pointId)}
                                            {/* O Journal é a auditoria: ele mostra a linha E diz por que
                                                as outras telas não a mostram. Sem a etiqueta, o operador
                                                veria aqui um número de passagens que não bate com o do
                                                Portail e não teria como explicar a diferença. */}
                                            {window.MagboPostoFixo?.ehRepeticao(l) && (
                                                <span
                                                    title={t('setor.repeticao.etiqueta')}
                                                    className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600"
                                                >
                                                    {l.flag === 'POSTO_FIXO' ? t('journal.flag.posto') : t('journal.flag.presente')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${isEntrada
                                                    ? 'text-success-700 bg-success-100'
                                                    : 'text-danger-700 bg-danger-100'
                                                }`}>
                                                {isEntrada ? t('rap.col.entrada') : t('rap.col.saida')}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="px-4 py-2 border-t border-soft-100 flex items-center justify-between text-sm">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            className="px-3 py-1 rounded-lg bg-soft-100 font-bold text-navy-500 hover:bg-soft-200 disabled:opacity-40 disabled:cursor-not-allowed">{t('journal.pag.anterior')}</button>
                        <span className="text-xs text-slate-400">{t('journal.pag.info', { p: page, total: totalPages, n: sorted.length })}{logs.length === 500 ? t('journal.pag.max') : ''}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="px-3 py-1 rounded-lg bg-soft-100 font-bold text-navy-500 hover:bg-soft-200 disabled:opacity-40 disabled:cursor-not-allowed">{t('journal.pag.proxima')}</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Par élève Tab ────────────────────────────────────────────────────
function ParEleveTab() {
    const t = useI18n();
    const locale = useLocale();
    const todayStr = () => new Date().toISOString().slice(0, 10);

    const [query,    setQuery]    = React.useState('');
    const [results,  setResults]  = React.useState([]);
    const [selected, setSelected] = React.useState(null);
    const [period,   setPeriod]   = React.useState('today');
    const [logs,     setLogs]     = React.useState([]);
    const [loading,  setLoading]  = React.useState(false);
    const [searched, setSearched] = React.useState(false);

    // Debounced search 250 ms (userCache.search é assíncrono — busca no backend)
    React.useEffect(() => {
        if (!query.trim()) { setResults([]); setSearched(false); return; }
        let cancelled = false;
        const tid = setTimeout(async () => {
            let hits = [];
            try {
                hits = await (window.userCache?.search?.(query.trim(), 8) || []);
            } catch (e) {
                hits = [];
            }
            if (cancelled) return;
            setResults(Array.isArray(hits) ? hits : []);
            setSearched(true);
        }, 250);
        return () => { cancelled = true; clearTimeout(tid); };
    }, [query]);

    const { dateFrom, dateTo } = React.useMemo(() => {
        const to   = new Date();
        const from = new Date();
        if (period === 'week')       from.setDate(to.getDate() - 6);
        else if (period === 'month') from.setDate(to.getDate() - 29);
        const fmt = d => d.toISOString().slice(0, 10);
        return { dateFrom: fmt(from), dateTo: fmt(to) };
    }, [period]);

    const loadLogs = React.useCallback(async (user) => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await window.api.fetchUserLogs(user.id, { dateFrom, dateTo });
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo]);

    React.useEffect(() => {
        const u = selected?.user || selected;
        if (u) loadLogs(u);
    }, [loadLogs, selected]);

    // Nome do ponto, nunca o código seco — pointLabel (js/data/constants.js)
    // resolve pelo ACCESS_POINTS e rotula o desconhecido como "Point X".
    const pointName = (id) => pointLabel(id);
    const tsMs = (ts) => typeof ts === 'number' ? ts : new Date(ts).getTime();
    const fmtTime = (ts) => new Date(tsMs(ts)).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const fmtDayHeader = (dateStr) => {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // Chips de présence derivados dos logs de hoje
    const presenceChips = React.useMemo(() => {
        const today = todayStr();
        const todayLogs = logs
            .filter(l => new Date(tsMs(l.timestamp)).toISOString().slice(0, 10) === today)
            .sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));

        const entry = todayLogs.find(l => l.action === 'ENTRADA' && String(l.pointId).startsWith('PORT'));
        const entryChip = entry
            ? { label: t('poraluno.entrou.as', { hora: fmtTime(entry.timestamp) }), cls: 'bg-success-100 text-success-700' }
            : { label: t('poraluno.nao.entrou'), cls: 'bg-slate-100 text-slate-500' };

        const internalPoints = ['REFEI1', 'REFEI2', 'CANTINA1', 'ENFERM', 'BIBLIO'];
        const lastInternal = [...todayLogs].reverse().find(l => internalPoints.includes(l.pointId));
        let locationChip = { label: t('poraluno.atualmente') + ' —', cls: 'bg-slate-100 text-slate-500' };
        if (lastInternal && lastInternal.action === 'ENTRADA') {
            const hasExitAfter = todayLogs.some(
                l => l.pointId === lastInternal.pointId && l.action === 'SAIDA' &&
                    tsMs(l.timestamp) > tsMs(lastInternal.timestamp)
            );
            if (!hasExitAfter) {
                locationChip = { label: t('poraluno.atualmente') + ' ' + pointName(lastInternal.pointId), cls: 'bg-accent-100 text-accent-700' };
            }
        }
        return [entryChip, locationChip];
    }, [logs]);

    // Grouper logs par jour (decroissant) + durées dérivées (ENTRADA→SAIDA même point, même jour)
    const logsByDay = React.useMemo(() => {
        const days = {};
        logs.forEach(l => {
            const key = new Date(tsMs(l.timestamp)).toISOString().slice(0, 10);
            if (!days[key]) days[key] = [];
            days[key].push({ ...l });
        });
        Object.values(days).forEach(dayLogs => {
            dayLogs.sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
            const open = {};
            dayLogs.forEach(l => {
                if (l.action === 'ENTRADA') {
                    // ⚠️ A ENTRADA de REPETICAO nao abre visita — mesma regra que
                    // reportFilters.pairVisits aplica no resto do sistema, e que
                    // esta aba ignorava. Sem isto, quem reentra tem a permanencia
                    // medida a partir do reconhecimento REPETIDO: no caso real do
                    // aluno 0003053 (E12:49 · E12:51 JA_PRESENTE · E12:54
                    // JA_PRESENTE · S13:10) a tela dizia 16 min onde foram 21 —
                    // sub-reportando justamente a permanencia de quem alguem foi
                    // conferir.
                    //
                    // ⚠️ ASSIMETRICO de proposito: pula ENTRADA marcada, NUNCA
                    // SAIDA. Pular a saida deixaria a visita aberta para sempre —
                    // o mesmo defeito de ocupacao ja pago em 10/08/2026.
                    if (window.MagboPostoFixo && window.MagboPostoFixo.ehRepeticao(l)) return;
                    open[l.pointId] = l;
                } else if (l.action === 'SAIDA' && open[l.pointId]) {
                    l._dur = Math.round((tsMs(l.timestamp) - tsMs(open[l.pointId].timestamp)) / 60000);
                    delete open[l.pointId];
                }
            });
            Object.values(open).forEach(l => {
                if (!String(l.pointId).startsWith('PORT')) l._open = true;
            });
        });
        return Object.entries(days).sort(([a], [b]) => b.localeCompare(a));
    }, [logs]);

    const u = selected?.user || selected;
    const lastMove = logs.length > 0 ? logs[0] : null;
    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300 bg-white';
    const periodBtns = [
        { id: 'today', label: t('periodo.hoje') },
        { id: 'week',  label: t('periodo.7dias.curto') },
        { id: 'month', label: t('periodo.30dias.curto') },
    ];

    return (
        <div>
            {/* ── Busca ── */}
            <div className="mb-4 relative">
                <div className="relative">
                    <LucideIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('poraluno.busca')}
                        className={inputCls + ' pl-9'}
                    />
                </div>
                {searched && results.length === 0 && (
                    <div className="mt-1 text-xs text-slate-400 pl-1">{t('poraluno.sem.resultado')}</div>
                )}
                {results.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-soft-200 shadow-lg overflow-hidden">
                        {results.map((hit, i) => {
                            const hu = hit.user || hit;
                            const hFoto = hu.foto_url || window.localAvatar(hu.nome || 'U');
                            return (
                                <button
                                    key={hu.id || i}
                                    onClick={() => { setSelected(hit); setQuery(''); setResults([]); setSearched(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-soft-50 transition-colors text-left"
                                >
                                    <PersonPhoto userId={hu.id} nome={hu.nome} fotoUrl={hu.foto_url}
                                        className="w-8 h-8 rounded-full object-cover bg-soft-100 shrink-0" />
                                    <span className="font-bold text-sm text-navy-500 flex-1 truncate">{hu.nome}</span>
                                    <span className="text-xs text-slate-400 shrink-0">{hu.turma || '—'}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Nenhum aluno selecionado ── */}
            {!u && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                    <LucideIcon name="user-search" size={40} className="text-slate-300" />
                    <p className="text-sm">{t('poraluno.instrucao')}</p>
                </div>
            )}

            {/* ── Aluno selecionado ── */}
            {u && (
                <>
                    {/* Card */}
                    <div className="flex items-center gap-4 bg-soft-50 rounded-2xl p-4 mb-4 border border-soft-200">
                        <PersonPhoto userId={u.id} nome={u.nome} fotoUrl={u.foto_url}
                            className="w-14 h-14 rounded-2xl object-cover bg-soft-200 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-navy-500 text-base truncate">{u.nome}</p>
                            <p className="text-xs text-slate-400">{u.turma || '—'} &middot; <span className="font-mono">{u.id}</span></p>
                            {lastMove && (
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {t('poraluno.ultimo')}&nbsp;: <b className="text-slate-600">{pointName(lastMove.pointId)}</b> {t('poraluno.as')} {fmtTime(lastMove.timestamp)} &middot; {logs.length}{logs.length === 500 ? '+' : ''} {t(logs.length > 1 ? 'poraluno.movimentos' : 'poraluno.movimento')} {t('poraluno.no.periodo')}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {presenceChips.map((c, i) => (
                                    <span key={i} className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.cls}`}>{c.label}</span>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={() => { setSelected(null); setLogs([]); }}
                            className="shrink-0 p-1 text-slate-400 hover:text-danger-500 transition-colors"
                            title={t('poraluno.desselecionar')}
                        >
                            <LucideIcon name="x" size={18} />
                        </button>
                    </div>

                    {/* Sélecteur de période */}
                    <div className="flex gap-2 mb-4">
                        {periodBtns.map(b => (
                            <button key={b.id} onClick={() => setPeriod(b.id)}
                                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                                    period === b.id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'
                                }`}
                            >{b.label}</button>
                        ))}
                        {loading && (
                            <span className="self-center text-xs text-slate-400 flex items-center gap-1 ml-2">
                                <LucideIcon name="loader-2" size={12} className="animate-spin" /> {t('comum.carregando')}
                            </span>
                        )}
                    </div>

                    {/* Timeline */}
                    {loading && logs.length === 0 && (
                        <div className="animate-pulse flex flex-col gap-6 mt-6">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="relative pl-6 border-l-2 border-slate-200">
                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-300"></div>
                                    <div className="bg-white border border-soft-200 rounded-2xl p-4 h-20 shadow-sm flex items-center justify-between">
                                        <div className="w-1/2">
                                            <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                                            <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                                        </div>
                                        <div className="h-6 bg-slate-100 rounded-full w-16"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {!loading && logs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                            <LucideIcon name="calendar-x" size={32} className="text-slate-300" />
                            <p className="text-sm">{t('poraluno.vazio')}</p>
                        </div>
                    )}
                    {logs.length > 0 && (
                        <div className="space-y-5">
                            {logsByDay.map(([dayKey, dayLogs]) => (
                                <div key={dayKey}>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 capitalize">
                                        {fmtDayHeader(dayKey)}
                                    </p>
                                    <div className="space-y-1.5">
                                        {dayLogs
                                            .slice()
                                            .sort((a, b) => tsMs(b.timestamp) - tsMs(a.timestamp))
                                            .map((l, i) => {
                                                const isEntrada = l.action === 'ENTRADA';
                                                return (
                                                    <div key={l.id || i} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-soft-100">
                                                        <span className="font-mono text-xs text-slate-400 w-12 shrink-0">{fmtTime(l.timestamp)}</span>
                                                        <span className="flex-1 text-sm text-slate-700 truncate">{pointName(l.pointId)}</span>
                                                        {l._open && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-amber-100 text-amber-700">
                                                                {t('poraluno.sem.saida')}
                                                            </span>
                                                        )}
                                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                            isEntrada ? 'bg-success-100 text-success-700' : 'bg-rose-100 text-rose-700'
                                                        }`}>
                                                            {isEntrada ? t('rap.col.entrada') : t('rap.col.saida')}{!isEntrada && l._dur != null ? ` (${l._dur} min)` : ''}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Overview Tab ─────────────────────────────────────────────────────
// D-H6 — agrégats des tentatives refusées (aujourd'hui), via /api/access/attempts/stats.
// Composant autonome (fetch propre) : ajouté à OverviewTab sans toucher son flux de données.
// N'affiche que les agrégations que le backend renvoie déjà (byReason/byPoint/byMethod/byTurma).
function DeniedAttemptStats() {
    const t = useI18n();
    const locale = useLocale();
    const [stats, setStats] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const s = await window.api.getAttemptStats(); // sans from/to → défaut = aujourd'hui
                if (alive) { setStats(s); setLoading(false); }
            } catch (e) {
                if (alive) { setError(true); setLoading(false); }
            }
        })();
        return () => { alive = false; };
    }, []);

    const sorted = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
    // `labels` aceita um MAPA (enums, como DENIAL_REASON_LABELS) ou uma
    // FUNÇÃO (pontos, cuja lista vive em ACCESS_POINTS e tem fallback
    // próprio). Antes "Par point" recebia null e imprimia PORT1/REFEI1 cru —
    // código onde o leitor espera um lugar.
    const block = (title, obj, labels) => {
        const rows = sorted(obj);
        const rotulo = (k) => typeof labels === 'function' ? labels(k) : ((labels && labels[k]) || k);
        return (
            <div className="bg-white rounded-2xl border border-soft-200 p-4 shadow-sm">
                <h4 className="text-sm font-black text-navy-500 mb-2">{title}</h4>
                {rows.length === 0 ? (
                    <p className="text-xs text-slate-400">{t('agregados.nenhuma')}</p>
                ) : (
                    <div className="space-y-1">
                        {rows.map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs">
                                <span className="text-slate-600">{rotulo(k)}</span>
                                <span className="font-bold text-navy-700">{v}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="mt-6">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <LucideIcon name="bar-chart-3" size={18} className="text-navy-500" />
                <h3 className="text-base font-black text-navy-500">{t('agregados.titulo')}</h3>
                {stats && (
                    <span className="text-xs text-slate-400">{t('agregados.total')} {stats.total} · {t('agregados.divergencias')} {stats.divergence}</span>
                )}
            </div>
            {loading ? (
                <div className="bg-white rounded-2xl border border-soft-200 p-4 shadow-sm text-xs text-slate-400">{t('agregados.carregando')}</div>
            ) : error || !stats ? (
                <div className="bg-white rounded-2xl border border-soft-200 p-4 shadow-sm text-xs text-slate-400">{t('agregados.indisponivel')}</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {block(t('agregados.por.motivo'), stats.byReason, (k) => window.MagboI18n.tEnum('denial', k))}
                    {block(t('agregados.por.ponto'), stats.byPoint, (k) => pointLabel(k))}
                    {block(t('agregados.por.metodo'), stats.byMethod, (k) => window.MagboI18n.tEnum('authMethod', k))}
                    {block(t('agregados.por.turma'), stats.byTurma,
                        (k) => k === 'UNKNOWN' ? t('agregados.sem.turma') : k)}
                </div>
            )}
        </div>
    );
}

function OverviewTab() {
    const t = useI18n();
    const locale = useLocale();
    const [period, setPeriod] = React.useState('week'); // 'today' | 'week' | 'month' | 'custom'
    const [customFrom, setCustomFrom] = React.useState(new Date().toISOString().slice(0, 10));
    const [customTo,   setCustomTo]   = React.useState(new Date().toISOString().slice(0, 10));
    const [data, setData] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [lastEvent, setLastEvent] = React.useState(null);  // HH:mm string ou null
    const [updatedAt, setUpdatedAt] = React.useState(null);  // HH:mm:ss string
    const [todayAlerts, setTodayAlerts] = React.useState([]);    // alertas de hoje
    /**
     * Contar o pessoal nos números do CDI. Padrão false — servidor entra por
     * segundos, sai sem passar o rosto, e o fechamento das 17:00 vira
     * permanência de um dia. Só o card do CDI reage a isto.
     */
    const [incluirFuncionarios, setIncluirFuncionarios] = React.useState(false);

    // ── A LISTA ATRÁS DO CONTADOR ────────────────────────────────────
    // ⚠️ Sob demanda, nunca no load da tela. O Vue d'ensemble já dispara quatro
    // requisições ao abrir; esta lista só interessa a quem clicou em "Ver quem",
    // e carregá-la sempre seria uma quinta consulta para todo mundo por causa de
    // um painel que a maioria nunca abre.
    //
    // ⚠️ Recarrega quando o PERÍODO muda. Sem isso, quem abre a lista na semana
    // e depois troca para o mês vê o card com o número novo e a lista com os
    // nomes velhos — o pior estado possível para uma tela cujo contrato é
    // "estes são exatamente aqueles".
    const [verIncompletos, setVerIncompletos] = React.useState(false);
    const [incompletos, setIncompletos] = React.useState(null);
    const [incompletosCarregando, setIncompletosCarregando] = React.useState(false);

    const carregarIncompletos = React.useCallback(async () => {
        setIncompletosCarregando(true);
        try {
            const r = typeof fetchIncompleteMovements === 'function'
                ? await fetchIncompleteMovements({ dateFrom, dateTo })
                : [];
            setIncompletos(r || []);
        } finally {
            setIncompletosCarregando(false);
        }
    }, [dateFrom, dateTo]);

    React.useEffect(() => {
        // O período mudou: o que estava carregado não vale mais.
        setIncompletos(null);
        if (verIncompletos) carregarIncompletos();
    }, [dateFrom, dateTo]);

    const abrirIncompletos = () => {
        if (verIncompletos) { setVerIncompletos(false); return; }
        setVerIncompletos(true);
        if (!incompletos) carregarIncompletos();
    };

    const { dateFrom, dateTo } = React.useMemo(() => {
        const fmt = d => d.toISOString().slice(0, 10);
        if (period === 'custom') {
            const f = customFrom <= customTo ? customFrom : customTo;
            const t = customFrom <= customTo ? customTo : customFrom;
            return { dateFrom: f, dateTo: t };
        }
        const to = new Date();
        const from = new Date();
        if (period === 'week') from.setDate(to.getDate() - 6);
        else if (period === 'month') from.setDate(to.getDate() - 29);
        return { dateFrom: fmt(from), dateTo: fmt(to) };
    }, [period, customFrom, customTo]);

    const fmtHHmm = (d) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const fmtHHmmss = (d) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const load = React.useCallback(async () => {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);
        try {
            const [d, lastLogArr, visits, meals] = await Promise.all([
                window.api.fetchOverview({ dateFrom, dateTo, incluirFuncionarios }),
                window.api.fetchAllLogs({ limit: 1 }).catch(() => []),
                (typeof fetchInfirmaryVisits === 'function'
                    ? fetchInfirmaryVisits({ dateFrom: today, dateTo: today })
                    : Promise.resolve([])
                ).catch(() => []),
                (typeof fetchRefectoryMeals === 'function'
                    ? fetchRefectoryMeals({ dateFrom: today, dateTo: today })
                    : Promise.resolve([])
                ).catch(() => [])
            ]);
            setData(d);
            const lastLog = Array.isArray(lastLogArr) && lastLogArr.length > 0 ? lastLogArr[0] : null;
            setLastEvent(lastLog && lastLog.timestamp ? fmtHHmm(new Date(lastLog.timestamp)) : null);
            // ── Construir lista de alertas client-side ──────────────────
            // O nome de quem está no alerta: era `v.nome || v.userId`, e um
            // alerta que diz "0003535 está há 50 min na enfermaria" obriga
            // quem lê a ir procurar de quem se trata — justamente quando o
            // alerta existe para alguém agir depressa.
            const quemE = (r) => window.MagboIdentity.resolver(
                { userId: r.userId, nome: r.nome }, { lang: 'fr' }).nome;
            const alerts = [];
            (Array.isArray(visits) ? visits : []).forEach(v => {
                if (!v.exitRegistered) {
                    alerts.push({
                        severite: 'critique',
                        type: t('vue.alerta.sem.saida.enferm'),
                        nome: quemE(v),
                        turma: v.turma || '—',
                        heure: v.entryTime || '—',
                        detail: t('rap.status.sem.saida'),
                    });
                } else if (v.durationMinutes != null && v.durationMinutes > 45) {
                    alerts.push({
                        severite: 'critique',
                        type: t('rap.status.estadia.longa'),
                        nome: quemE(v),
                        turma: v.turma || '—',
                        heure: v.entryTime || '—',
                        detail: v.durationMinutes + ' min',
                    });
                } else if (v.durationMinutes != null && v.durationMinutes > 30) {
                    alerts.push({
                        severite: 'attention',
                        type: t('rap.status.estadia.longa'),
                        nome: quemE(v),
                        turma: v.turma || '—',
                        heure: v.entryTime || '—',
                        detail: v.durationMinutes + ' min',
                    });
                }
            });
            (Array.isArray(meals) ? meals : []).forEach(m => {
                if (!m.exitRegistered) {
                    alerts.push({
                        severite: 'attention',
                        type: t('vue.alerta.sem.saida.cantina'),
                        nome: quemE(m),
                        turma: m.turma || '—',
                        heure: m.entryTime || '—',
                        detail: t('rap.status.sem.saida'),
                    });
                } else if (!m.onTime) {
                    alerts.push({
                        severite: 'info',
                        type: t('vue.alerta.refeicao.fora'),
                        nome: quemE(m),
                        turma: m.turma || '—',
                        heure: m.entryTime || '—',
                        detail: t('vue.alerta.fora.faixa'),
                    });
                }
            });
            // Ordenar por heure desc
            alerts.sort((a, b) => (b.heure || '').localeCompare(a.heure || ''));
            setTodayAlerts(alerts);
        } catch (e) {
            setData(null);
            setLastEvent(null);
            setTodayAlerts([]);
        } finally {
            setUpdatedAt(fmtHHmmss(new Date()));
            setLoading(false);
        }
    }, [dateFrom, dateTo, incluirFuncionarios]);

    React.useEffect(() => { load(); }, [load]);

    const grandTotal = data?.totalMovements || 0;
    const allUniques = data?.uniqueStudents || 0;
    const prevTotal = data?.previousTotal ?? null;
    const trend = (prevTotal == null || prevTotal === 0) ? null
        : Math.round(((grandTotal - prevTotal) / prevTotal) * 100);

    const areaLabels = { cantine: t('vue.area.cantine'), infirmerie: t('vue.area.infirmerie'), cdi: 'CDI', portail: t('vue.area.portail') };
    const areaIcons = { cantine: 'utensils', infirmerie: 'heart-pulse', cdi: 'book-open', portail: 'door-open' };
    const areaStats = (data?.areas || []).map(a => ({
        key: a.area,
        label: areaLabels[a.area] || a.area,
        icon: areaIcons[a.area] || 'square',
        total: a.movements,
        uniques: a.uniqueStudents,
        entradas: a.entries,
        occupation: a.currentOccupancy,
        dureeMoy: a.avgDurationMin,
    }));
    const maxAreaTotal = Math.max(...areaStats.map(a => a.total), 1);

    const attention = {
        sejoursLongs: data?.longInfirmaryStays || 0,
        repasHorsHoraire: data?.offScheduleMeals || 0,
        sortiesNonEnreg: data?.unregisteredExits || 0,
        total: (data?.longInfirmaryStays || 0) + (data?.offScheduleMeals || 0) + (data?.unregisteredExits || 0),
    };

    // pico de hora (do byHour)
    const picoHora = (() => {
        const bh = data?.byHour || [];
        if (!bh.length) return null;
        return bh.reduce((max, h) => h.count > max.count ? h : max, bh[0]).hour;
    })();
    const zonaMaisAtiva = areaStats.length
        ? areaStats.reduce((max, a) => a.total > max.total ? a : max, areaStats[0])
        : null;

    const areaColor = {
        cantine: 'bg-accent-500', infirmerie: 'bg-danger-500', cdi: 'bg-warning-500', portail: 'bg-navy-500'
    };
    const areaBarColor = {
        cantine: '#f97316', infirmerie: '#ef4444', cdi: '#eab308', portail: '#0c1b3a'
    };

    const periodoLabel = period === 'today' ? "aujourd'hui"
        : period === 'week' ? t('periodo.7dias')
        : period === 'month' ? t('periodo.30dias')
        : t('vue.periodo.personalizado');

    return (
        <div>
            {/* ── Toggle de période ── */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
                {[
                    { id: 'today',  label: t('periodo.hoje') },
                    { id: 'week',   label: t('periodo.semana') },
                    { id: 'month',  label: t('periodo.mes') },
                    { id: 'custom', label: t('periodo.personalizado') },
                ].map(p => (
                    <button key={p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${period === p.id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'}`}
                    >
                        {p.label}
                    </button>
                ))}
                {period === 'custom' && (
                    <span className="flex items-center gap-2 ml-1">
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            className="px-3 py-1.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300" />
                        <span className="text-xs text-slate-400">{t('vue.au')}</span>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            className="px-3 py-1.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300" />
                    </span>
                )}
                {/* Escopo dos números do CDI, dito na tela. Só o card do CDI
                    reage — cantina e enfermaria seguem com as agregações já
                    validadas em produção. */}
                <label className="ml-auto flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none"
                       title={t('vue.incluir.pessoal.ajuda')}>
                    <input
                        type="checkbox"
                        checked={incluirFuncionarios}
                        onChange={e => setIncluirFuncionarios(e.target.checked)}
                        className="w-3.5 h-3.5 accent-accent-500"
                    />
                    {t('vue.incluir.pessoal')}
                </label>
                {loading && (
                    <span className="self-center text-xs text-slate-400 flex items-center gap-1 ml-2">
                        <LucideIcon name="loader-2" size={12} className="animate-spin" /> {t('comum.carregando')}
                    </span>
                )}
            </div>

            {/* ── État loading initial (sans data préalable) ── */}
            {loading && data === null && (
                <div className="animate-pulse flex flex-col gap-5 mt-2">
                    {/* Skeleton KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 h-28 flex flex-col justify-between">
                                <div>
                                    <div className="h-8 bg-slate-200 rounded w-1/2 mb-2"></div>
                                    <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                                </div>
                                <div className="h-2 bg-slate-200 rounded w-1/3"></div>
                            </div>
                        ))}
                    </div>
                    {/* Skeleton Charts Area */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-72 flex flex-col">
                            <div className="h-5 bg-slate-200 rounded w-1/3 mb-6"></div>
                            <div className="flex-1 bg-slate-100 rounded-xl"></div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-72 flex flex-col">
                            <div className="h-5 bg-slate-200 rounded w-1/3 mb-6"></div>
                            <div className="flex-1 bg-slate-100 rounded-xl"></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── État erreur ── */}
            {!loading && data === null && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-4">
                    <LucideIcon name="wifi-off" size={40} className="text-slate-300" />
                    <p className="text-sm font-semibold text-slate-500">{t('vue.erro.carregar')}</p>
                    <button
                        onClick={load}
                        className="px-5 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 transition-colors"
                    >
                        {t('acao.reessayer')}
                    </button>
                </div>
            )}

            {/* ── Contenu principal (data disponível) ── */}
            {data !== null && !loading && (
                <>
                    {/* ── KPIs globaux ── */}
                    {React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-3 mb-5" },
                        // 1. Mouvements
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-slate-900" }, grandTotal.toLocaleString(locale)),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, t('vue.kpi.movimentos')),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, t('vue.kpi.setores.internos'))
                            ),
                            trend !== null ? React.createElement("p", { className: "text-[11px] font-medium mt-2 text-slate-500" },
                                (trend >= 0 ? '▲ ' : '▼ ') + Math.abs(trend) + "%"
                            ) : null
                        ),
                        // 2. Élèves uniques
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-blue-600" }, allUniques.toLocaleString(locale)),
                                // "Personnes uniques", e não "Élèves": countUniqueStudents
                                // é COUNT(DISTINCT user_id) SEM filtro de tipo — professor e
                                // personnel entram. A query é legada e não muda de resultado
                                // (regra do projeto); o rótulo é que estava errado.
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, t('vue.kpi.pessoas.unicas')),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, t('vue.kpi.no.periodo'))
                            )
                        ),
                        // 3. Présents aujourd'hui
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-emerald-600" }, (data?.presentToday || 0).toLocaleString(locale)),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, t('vue.kpi.presentes')),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, t('vue.kpi.entraram'))
                            )
                        ),
                        // 4. Dans les secteurs
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold text-indigo-600" }, (data?.currentlyInSectors || 0).toLocaleString(locale)),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, t('vue.kpi.nos.setores')),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, t('vue.kpi.agora'))
                            )
                        ),
                        // 5. Alertes actives
                        React.createElement("div", { className: "bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" },
                            React.createElement("div", null,
                                React.createElement("p", { className: "text-2xl font-bold " + (attention.total > 0 ? "text-rose-600" : "text-emerald-600") }, (attention.total || 0).toLocaleString(locale)),
                                React.createElement("p", { className: "text-xs font-semibold text-slate-700 mt-1" }, t('vue.kpi.alertas')),
                                React.createElement("p", { className: "text-[11px] text-slate-400" }, t('vue.kpi.pontos.atencao'))
                            )
                        )
                    )}

                    {(() => {
                        const totEntrees = areaStats.reduce((s, a) => s + (a.entradas || 0), 0);
                        const totSorties = Math.max(0, grandTotal - totEntrees);
                        return (
                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                                    <p className="text-xl font-bold text-emerald-600">{totEntrees.toLocaleString(locale)}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{t('vue.entradas.internas')}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                                    <p className="text-xl font-bold text-rose-600">{totSorties.toLocaleString(locale)}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{t('vue.saidas.internas')}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-2xl p-3 text-center">
                                    <p className="text-xl font-bold text-amber-600">{(attention.sortiesNonEnreg || 0).toLocaleString(locale)}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{t('vue.mov.incompletos')}</p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Barra de status ── */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 mb-5">
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${data ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {data ? t('vue.servidor.online') : t('vue.servidor.offline')}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span>{t('vue.periodo.rotulo')}&nbsp;: {dateFrom.split('-').reverse().join('/')} – {dateTo.split('-').reverse().join('/')}</span>
                        <span className="text-slate-300">|</span>
                        <span>{t('vue.ultimo.evento')}&nbsp;: {lastEvent || t('vue.nao.disponivel')}</span>
                        <span className="text-slate-300">|</span>
                        <span>{t('vue.atualizado.as')} {updatedAt || '—'}</span>
                        <button onClick={load} disabled={loading}
                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-soft-100 text-navy-500 font-bold hover:bg-soft-200 transition-colors disabled:opacity-50">
                            <LucideIcon name="refresh-cw" size={12} className={loading ? 'animate-spin' : ''} />
                            {t('acao.atualizar')}
                        </button>
                    </div>

                    {/* ── Analyse de l'Activité ── */}
                    <div className="bg-warning-50 border border-warning-200 rounded-2xl p-4 mb-5 flex gap-3">
                        <LucideIcon name="lightbulb" size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-warning-700 text-sm">{t('vue.analise.titulo')}</p>
                            <p className="text-sm text-slate-600 mt-1">
                                {grandTotal === 0
                                    ? t('vue.analise.vazia')
                                    : (<>{t('vue.analise.zona.a')} <b>{zonaMaisAtiva.label}</b> ({t('vue.analise.zona.b', { n: zonaMaisAtiva.total })}). {t('vue.analise.pico')} <b>{picoHora}h</b>. {t(allUniques === 1 ? 'vue.analise.circulou' : 'vue.analise.circularam', { n: allUniques, periodo: periodoLabel })}{attention.total > 0 ? (<> {t('vue.analise.atencao')}&nbsp;: <b>{attention.sortiesNonEnreg >= attention.repasHorsHoraire && attention.sortiesNonEnreg >= attention.sejoursLongs ? t('vue.atencao.saidas') : (attention.repasHorsHoraire >= attention.sejoursLongs ? t('vue.atencao.refeicoes') : t('vue.atencao.estadias'))}</b> ({t('vue.analise.casos', { n: Math.max(attention.sejoursLongs, attention.repasHorsHoraire, attention.sortiesNonEnreg) })}).</>) : null}</>)
                                }
                            </p>
                        </div>
                    </div>

                    {/* ── Gráficos ou estado sem dados ── */}
                    {grandTotal === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 bg-slate-50 rounded-xl mb-5">
                            <LucideIcon name="bar-chart-2" size={32} className="text-slate-300" />
                            <p className="text-sm">{t('poraluno.vazio')}</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Affluence par Heure ── */}
                            {(() => {
                                // ⚠️ ALTURA EM PIXELS, via MagboBarChart — o MESMO defeito já
                                // consertado no CDI (StatsModal): `height: %` só resolve contra
                                // pai de altura definida, e o `items-end` não estica a coluna —
                                // a porcentagem virava `auto`, a barra colapsava e o minHeight
                                // de 4px assumia. 2, 13, 21, 29, 6 e 11 saíam IDÊNTICOS.
                                // Reusa js/utils/barChart.js; segunda implementação, jamais.
                                const porHora = data?.byHour || [];
                                const contagens = Object.fromEntries(porHora.map(h => [h.hour, h.count]));
                                const barras = window.MagboBarChart.series(
                                    contagens, porHora.map(h => h.hour), { alturaMaxima: 88 });
                                const maxHourCount = Math.max(...porHora.map(h => h.count), 1);
                                return React.createElement("div", { className: "bg-slate-50 rounded-xl p-4 mb-5" },
                                    React.createElement("h3", { className: "font-semibold mb-3 text-sm" }, t('cdi.stats.afluencia')),
                                    React.createElement("div", { className: "flex items-end gap-1 h-32 border-b border-slate-200" },
                                        barras.map(function (b) {
                                            const isMax = b.valor === maxHourCount && b.valor > 0;
                                            return React.createElement("div", { key: b.chave, className: "flex-1 flex flex-col items-center" },
                                                React.createElement("span", { className: "text-[10px] font-medium text-slate-600 mb-1" }, b.valor > 0 ? (b.valor >= 1000 ? (b.valor / 1000).toFixed(1) + "k" : b.valor) : ""),
                                                React.createElement("div", {
                                                    className: "w-full rounded-t",
                                                    title: t('vue.tooltip.hora', { h: b.chave, n: b.valor }),
                                                    style: {
                                                        height: b.altura + "px",
                                                        backgroundColor: isMax ? "#F59E0B" : "#0055FF"
                                                    }
                                                }),
                                                React.createElement("span", { className: "text-[10px] text-slate-400 mt-1" }, b.chave + "h")
                                            );
                                        })
                                    )
                                );
                            })()}

                            {/* ── Répartition par Zone ── */}
                            {React.createElement("div", { className: "bg-slate-50 rounded-xl p-4 mb-5" },
                                React.createElement("h3", { className: "font-semibold mb-3 text-sm" }, t('vue.grafico.zonas')),
                                [...areaStats].sort((a, b) => b.total - a.total).map(function (a) {
                                    const areaColorMap = { cantine: "#3B82F6", infirmerie: "#EF4444", cdi: "#F59E0B", portail: "#1E293B" };
                                    return React.createElement("div", { key: a.key, className: "flex items-center gap-3 mb-2" },
                                        React.createElement("span", { className: "w-24 text-sm font-medium text-slate-700" }, a.label),
                                        React.createElement("div", { className: "flex-1 h-6 bg-slate-200 rounded-full overflow-hidden" },
                                            React.createElement("div", {
                                                className: "h-full rounded-full",
                                                style: {
                                                    width: (a.total / maxAreaTotal * 100) + "%",
                                                    backgroundColor: areaColorMap[a.key] || "#94a3b8"
                                                }
                                            })
                                        ),
                                        React.createElement("span", { className: "w-20 text-sm text-right text-slate-600" }, a.total.toLocaleString(locale) + " " + t('vue.mvt'))
                                    );
                                })
                            )}

                            {React.createElement("div", { className: "bg-slate-50 rounded-xl p-4 mb-5" },
                                React.createElement("h3", { className: "font-semibold mb-3 text-sm" }, t('vue.grafico.entradas.saidas')),
                                [...areaStats].sort((a, b) => b.total - a.total).map(function (a) {
                                    const sorties = Math.max(0, a.total - (a.entradas || 0));
                                    const maxRef = Math.max(maxAreaTotal, 1);
                                    return React.createElement("div", { key: a.key, className: "mb-3" },
                                        React.createElement("div", { className: "flex justify-between text-xs text-slate-500 mb-1" },
                                            React.createElement("span", { className: "font-medium text-slate-700" }, a.label),
                                            React.createElement("span", null,
                                                React.createElement("span", { className: "text-emerald-600 font-bold" }, a.entradas),
                                                " " + t('vue.seg.entradas') + " \u00b7 ",
                                                React.createElement("span", { className: "text-rose-600 font-bold" }, sorties),
                                                " " + t('vue.seg.saidas')
                                            )
                                        ),
                                        React.createElement("div", { className: "flex gap-1" },
                                            React.createElement("div", { className: "h-2.5 rounded-full bg-emerald-500", style: { width: Math.max((a.entradas / maxRef) * 100, 1) + "%" } }),
                                            React.createElement("div", { className: "h-2.5 rounded-full bg-rose-400", style: { width: Math.max((sorties / maxRef) * 100, 1) + "%" } })
                                        )
                                    );
                                })
                            )}
                        </>
                    )}

                    {/* ── Points d'attention ── */}
                    {(() => {
                        const severiteCls = {
                            critique: { badge: 'bg-rose-100 text-rose-700', icon: 'alert-octagon', border: 'border-rose-100' },
                            attention: { badge: 'bg-amber-100 text-amber-700', icon: 'alert-triangle', border: 'border-amber-100' },
                            info: { badge: 'bg-sky-100 text-sky-700', icon: 'info', border: 'border-sky-100' },
                        };
                        const visibleAlerts = todayAlerts.slice(0, 10);
                        const hasAlerts = attention.total > 0 || todayAlerts.length > 0;
                        return (
                            <div className={`rounded-2xl border p-4 mb-5 ${hasAlerts ? 'bg-danger-50 border-danger-200' : 'bg-success-50 border-success-200'}`}>
                                {/* ── En-tête ── */}
                                <div className="flex items-center gap-2 mb-3">
                                    <LucideIcon name={hasAlerts ? 'alert-triangle' : 'shield-check'} size={20} className={hasAlerts ? 'text-danger-600' : 'text-success-600'} />
                                    <h3 className={`font-black text-sm ${hasAlerts ? 'text-danger-700' : 'text-success-700'}`}>
                                        {t('vue.atencao.titulo')} {attention.total > 0 ? `(${attention.total})` : ''}
                                    </h3>
                                </div>

                                {/* ── Contadores do período (mantidos) ── */}
                                {attention.total === 0 && todayAlerts.length === 0 ? (
                                    <p className="text-sm text-slate-600 mb-0">{t('vue.atencao.nenhuma')}</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                        <div className="bg-white rounded-xl p-3 border border-danger-100">
                                            <p className="text-2xl font-black text-danger-600">{attention.sejoursLongs}</p>
                                            <p className="text-xs text-slate-500 mt-1">{t('vue.card.estadias')}</p>
                                        </div>
                                        <div className="bg-white rounded-xl p-3 border border-danger-100">
                                            <p className="text-2xl font-black text-warning-600">{attention.repasHorsHoraire}</p>
                                            <p className="text-xs text-slate-500 mt-1">{t('vue.alerta.refeicao.fora')}</p>
                                        </div>
                                        {/* ⚠️ O NÚMERO NÃO MUDA — ele continua sendo
                                            `unregisteredExits`, do mesmo endpoint, contando o
                                            mesmo. O que muda é que agora dá para perguntar QUAIS:
                                            um número não permite ir procurar ninguém. */}
                                        <div className="bg-white rounded-xl p-3 border border-danger-100">
                                            <p className="text-2xl font-black text-slate-600">{attention.sortiesNonEnreg}</p>
                                            <p className="text-xs text-slate-500 mt-1">{t('vue.card.saidas.nao.enreg')}</p>
                                            {attention.sortiesNonEnreg > 0 && (
                                                <button type="button" onClick={abrirIncompletos}
                                                    className="mt-2 text-[11px] font-bold text-accent-600 hover:text-accent-700 underline">
                                                    {verIncompletos ? t('incompletos.fechar') : t('incompletos.abrir')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {verIncompletos && (
                                    <MouvementsIncomplets
                                        movimentos={incompletos}
                                        carregando={incompletosCarregando}
                                        onFechar={() => setVerIncompletos(false)}
                                    />
                                )}

                                {/* ── Alertes récentes (aujourd'hui) ── */}
                                <div className="mt-1">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                        {t('vue.alertas.recentes')}
                                    </p>
                                    {todayAlerts.length === 0 ? (
                                        <div className="flex items-center gap-2 text-success-700 text-sm py-2">
                                            <LucideIcon name="check-circle-2" size={16} className="text-success-500" />
                                            {t('vue.alertas.nenhuma')}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                {visibleAlerts.map((al, i) => {
                                                    const cls = severiteCls[al.severite] || severiteCls.info;
                                                    return (
                                                        <div key={i} className={`flex items-center gap-3 bg-white rounded-xl px-3 py-2 border ${cls.border}`}>
                                                            <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls.badge}`}>
                                                                {al.severite}
                                                            </span>
                                                            <span className="font-bold text-sm text-slate-800 truncate">{al.nome}</span>
                                                            <span className="text-xs text-slate-400 shrink-0">{al.turma}</span>
                                                            <span className="text-xs text-slate-500 truncate flex-1">{al.type}</span>
                                                            <span className="text-xs text-slate-400 font-mono shrink-0">{al.heure}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {todayAlerts.length > 10 && (
                                                <p className="text-xs text-slate-400 mt-2 text-right">
                                                    {t('vue.alertas.total', { n: todayAlerts.length })}
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Cards par zone avec barre CSS ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {areaStats.map(a => (
                            <div key={a.key} className="bg-white rounded-2xl border border-soft-200 p-4 shadow-sm">
                                {/* en-tête zone */}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-xl ${areaColor[a.key] || 'bg-slate-400'} flex items-center justify-center`}>
                                        <LucideIcon name={a.icon} size={20} className="text-white" />
                                    </div>
                                    <h3 className="text-base font-black text-navy-500">{a.label}</h3>
                                </div>

                                {/* barre de fréquentation CSS (comme le CDI) */}
                                <div className="mb-3">
                                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                                        <span>{t('vue.freq.relativa')}</span>
                                        <span>{a.total} {t('vue.mvt')}</span>
                                    </div>
                                    <div className="h-3 bg-soft-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${Math.round((a.total / maxAreaTotal) * 100)}%`, backgroundColor: areaBarColor[a.key] || '#94a3b8' }}
                                        />
                                    </div>
                                </div>

                                {/* métriques */}
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-2xl font-black text-navy-500">{a.total}</p>
                                        <p className="text-xs text-slate-400">{t('vue.kpi.movimentos')}</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-success-600">{a.entradas}</p>
                                        <p className="text-xs text-slate-400">{t('vue.card.entradas')}</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-rose-500">{Math.max(0, a.total - (a.entradas || 0))}</p>
                                        <p className="text-xs text-slate-400">{t('vue.card.saidas')}</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-indigo-600">{a.occupation ?? 0}</p>
                                        <p className="text-xs text-slate-400">{t('vue.card.ocupacao')}</p>
                                    </div>
                                    <div>
                                        <p className={`text-2xl font-black ${a.uniques > 0 ? 'text-accent-600' : 'text-slate-300'}`}>{a.uniques > 0 ? a.uniques : '—'}</p>
                                        <p className="text-xs text-slate-400">{a.key === 'cdi' && !incluirFuncionarios ? t('rap.kpi.alunos.unicos') : t('vue.kpi.pessoas.unicas')}</p>
                                    </div>
                                    <div>
                                        <p className={`font-black ${a.dureeMoy != null ? 'text-2xl text-navy-500' : 'text-lg text-slate-300'}`}>{a.dureeMoy != null ? a.dureeMoy + ' min' : t('vue.indisponivel.curto')}</p>
                                        <p className="text-xs text-slate-400">{t('cdi.stats.duracao.curta')}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="bg-white rounded-2xl border-2 border-dashed border-navy-200 p-4 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-navy-500 flex items-center justify-center">
                                    <LucideIcon name="door-open" size={20} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-navy-500">{t('vue.area.portail')}</h3>
                                    <p className="text-[11px] text-slate-400">{t('vue.portao.subtitulo')}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div>
                                    <p className="text-2xl font-black text-emerald-600">{(data?.presentToday || 0).toLocaleString(locale)}</p>
                                    <p className="text-xs text-slate-400">{t('vue.card.entraram.hoje')}</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-indigo-600">{(data?.currentlyInSectors || 0).toLocaleString(locale)}</p>
                                    <p className="text-xs text-slate-400">{t('vue.kpi.nos.setores')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Tentatives Refusées ── */}
                    <div className="mt-6">
                        <DeniedAttemptsFeed
                            title={t('vue.feed.titulo')}
                            emptyMessage={t('vue.feed.vazio')}
                            fetchFn={window.api?.getAllAttempts || (async () => [])}
                        />
                    </div>

                    {/* ── Agrégats des tentatives refusées (D-H6) ── */}
                    <DeniedAttemptStats />
                </>
            )}
        </div>
    );
}

// ── GeneralReport ─────────────────────────────────────────────────────
function GeneralReport({ onBack }) {
    const t = useI18n();
    const locale = useLocale();
    const [tab, setTab] = React.useState('overview'); // 'overview' | 'student' | 'journal'

    const tabBtn = (id, label, icon) => (
        <button onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === id ? 'bg-accent-500 text-white shadow-sm' : 'bg-soft-100 text-navy-500 hover:bg-soft-200'
                }`}>
            <LucideIcon name={icon} size={16} /> {label}
        </button>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {/* ── Page Header ── */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="w-10 h-10 rounded-xl bg-white border border-soft-200 shadow-sm flex items-center justify-center hover:bg-soft-50 transition-colors"
                        >
                            <LucideIcon name="arrow-left" size={18} className="text-navy-500" />
                        </button>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-navy-500 flex items-center justify-center">
                            <LucideIcon name="layout-dashboard" size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-navy-500 tracking-tight">{t('geral.titulo')}</h1>
                            <p className="text-sm text-slate-400 mt-0.5">{t('geral.subtitulo')}</p>
                        </div>
                    </div>
                </div>
                <span className="text-xs text-slate-400 font-medium bg-soft-100 px-3 py-1.5 rounded-lg border border-soft-200">
                    <LucideIcon name="shield-check" size={12} className="inline mr-1 text-accent-500" />
                    {t('geral.acesso.admin')}
                </span>
            </div>

            {/* ── Tab Bar ── */}
            <div className="flex flex-wrap gap-2 mb-6">
                {tabBtn('overview', t('geral.aba.vue'), 'bar-chart-3')}
                {/* "Par personne" e não "Par élève": a busca usa
                    userCache.search, que devolve TODO o cadastro — professor e
                    personnel inclusive. Só a tela de Sorties filtra para aluno
                    (MagboExitPermission.apenasAlunos), e esta não. */}
                {tabBtn('student', t('geral.aba.pessoa'), 'user-search')}
                {tabBtn('journal', t('geral.aba.journal'), 'list')}
            </div>

            {/* ── Tab Content ── */}
            <div className="bg-white rounded-2xl border border-soft-200 p-6 shadow-sm min-h-[400px]">
                <div className={tab === 'overview' ? '' : 'hidden'}><OverviewTab /></div>
                <div className={tab === 'student' ? '' : 'hidden'}><ParEleveTab /></div>
                <div className={tab === 'journal' ? '' : 'hidden'}><JournalTab active={tab === 'journal'} /></div>
            </div>
        </div>
    );
}
