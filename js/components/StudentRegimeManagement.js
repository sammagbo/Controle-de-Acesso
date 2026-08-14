// =====================================================================
// RÉGIME DE SORTIE — a tela da Vie Scolaire
// =====================================================================
// Aqui se registra o que a família declarou por escrito no início do ano:
// sob que regime aquela criança pode sair do estabelecimento.
// Circulaire n° 96-248 du 25 octobre 1996.
//
// ⚠️ ESTA TELA NÃO DECIDE NADA. Ela TRANSCREVE um papel assinado. É por isso
// que "autorizado por (responsável legal)" é obrigatório e que a referência do
// documento fica em destaque: sem eles, a linha no banco afirma que uma criança
// pode sair sozinha sem que ninguém tenha dito isso.
//
// ⚠️ Nada é apagado. Substituir um regime encerra o anterior e abre outro; os
// dois ficam, e o histórico mostra a passagem de um para o outro. Uma escola
// precisa poder dizer, seis meses depois, qual era a autorização vigente
// naquela terça-feira.

// ⚠️ TONS: só 50, 100, 500 e 600 existem para success/danger/warning no
// tailwind.config inline do index.html (accent tem 400–700, sem 50). Uma classe
// com tom não definido NÃO É GERADA — a cor simplesmente não sai, e o aviso
// fica cinza no meio da tela. Onde faltava um tom intermediário, usa-se a
// opacidade do 500 (`border-warning-500/40`), que o Tailwind gera. Apanhado
// pelo agente de qualidade em 14/08/2026, lendo o config.

function StudentRegimeManagement({ onBack }) {
    const t = useI18n();
    const locale = useLocale();
    const { useState, useEffect, useCallback } = React;

    const [resumo, setResumo] = useState(null);
    const [busca, setBusca] = useState('');
    const [resultados, setResultados] = useState([]);
    const [aluno, setAluno] = useState(null);
    const [dados, setDados] = useState(null);      // { vigente, historico, eventos }
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState(null);
    const [aviso, setAviso] = useState(null);

    const VAZIO = {
        regimeGeneral: 'EXTERNE',
        regimeSortie: 'REGIME_1',
        validFrom: new Date().toISOString().slice(0, 10),
        validUntil: '',
        authorizedByFamily: '',
        documentoRef: '',
        assinadoEm: '',
        note: ''
    };
    const [form, setForm] = useState(VAZIO);

    /**
     * O responsável LEGAL que o sistema já conhece.
     *
     * ⚠️ Este campo é PROVA: ele diz quem, na família, autorizou aquela criança
     * a sair sozinha. Pedi-lo como texto livre seriam 923 digitações em setembro
     * e 923 strings que não provam nada — um erro de grafia e a prova deixa de
     * casar com o cadastro. O MAGBO já tem o nome (app_users.responsavel_id, o
     * mesmo que o PortariaModal exibe no portão), então ele é oferecido, não
     * perguntado.
     *
     * O texto livre continua existindo para o caso real em que quem assinou NÃO
     * é o responsável cadastrado (avó, tutor novo, procuração) — e nesse caso a
     * tela marca a linha como exceção, em vez de deixá-la parecer rotina.
     */
    const [responsavel, setResponsavel] = useState(null);
    const [outroAutor, setOutroAutor] = useState(false);

    // ── CARGA EM LOTE ────────────────────────────────────────────────
    // ⚠️ Sem ela o módulo não sai do dia 1: são 923 regimes, e um por vez com
    // busca e formulário são 923 operações em setembro. O CPE foi explícito —
    // sem os regimes carregados o portão fica cinza e o AED continua decidindo
    // de memória, que é o problema que o módulo existe para resolver.
    //
    // ⚠️ Mesma disciplina do import do HikCentral e das fotos: SIMULA, mostra
    // linha a linha o que aconteceria, e só grava com confirmação explícita.
    const [importLinhas, setImportLinhas] = useState(null);
    const [importPlano, setImportPlano] = useState(null);
    const [importando, setImportando] = useState(false);
    const [importErro, setImportErro] = useState(null);

    const lerArquivo = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImportErro(null);
        setImportPlano(null);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const wb = window.XLSX.read(evt.target.result, { type: 'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = window.XLSX.utils.sheet_to_json(
                    sheet, window.MagboRegimeSheet.sheetOptions());
                const linhas = window.MagboRegimeSheet.mapRows(json);
                if (linhas.length === 0) { setImportErro(t('regime.import.vazio')); return; }
                setImportLinhas(linhas);
            } catch (err) {
                setImportErro(t('regime.import.erro.leitura') + err.message);
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const simularImport = async () => {
        if (!importLinhas || importando) return;
        setImportando(true);
        setImportErro(null);
        try {
            setImportPlano(await window.api.simularImportRegimes(importLinhas));
        } catch (err) {
            setImportErro(err.message);
        } finally {
            setImportando(false);
        }
    };

    const aplicarImport = async () => {
        if (!importLinhas || importando) return;
        setImportando(true);
        try {
            setImportPlano(await window.api.aplicarImportRegimes(importLinhas));
            await carregarResumo();
        } catch (err) {
            setImportErro(err.message);
        } finally {
            setImportando(false);
        }
    };

    const limparImport = () => {
        setImportLinhas(null); setImportPlano(null); setImportErro(null);
    };

    const ACOES_REGIME = {
        CRIAR: 'bg-success-100 text-success-600',
        ATUALIZAR: 'bg-accent-500/15 text-accent-600',
        PULAR: 'bg-soft-100 text-slate-600',
        CONFLITO: 'bg-danger-100 text-danger-600'
    };

    const carregarResumo = useCallback(async () => {
        try {
            setResumo(await window.api.getRegimeSummary());
        } catch (e) {
            setResumo(null);
        }
    }, []);

    useEffect(() => { carregarResumo(); }, [carregarResumo]);

    // Busca remota com debounce de 250ms — padrão fechado do projeto
    // (js/utils/userCache.js). Lista local seria uma segunda verdade sobre quem
    // é aluno desta escola.
    useEffect(() => {
        const q = busca.trim();
        if (q.length < 2) { setResultados([]); return; }
        let vivo = true;
        const tid = setTimeout(async () => {
            try {
                const achados = await window.userCache.search(q, 20);
                if (vivo) setResultados((achados || []).filter(u => u.tipo === 'ALUNO'));
            } catch (e) {
                if (vivo) setResultados([]);
            }
        }, 250);
        return () => { vivo = false; clearTimeout(tid); };
    }, [busca]);

    const escolher = async (u) => {
        setAluno(u);
        setResultados([]);
        setBusca(u.nome || '');
        setErro(null);
        setAviso(null);
        setCarregando(true);
        setResponsavel(null);
        setOutroAutor(false);
        try {
            // O responsável vem do cadastro, não do teclado.
            let doCadastro = null;
            try {
                const ficha = await window.api.fetchUser(u.id);
                if (ficha && ficha.responsavel && ficha.responsavel.nome) {
                    doCadastro = ficha.responsavel;
                    setResponsavel(ficha.responsavel);
                }
            } catch (e) { /* sem responsável no cadastro: cai no texto livre */ }
            const d = await window.api.getRegimeDoAluno(u.id);
            // ⚠️ QUEM ESTÁ GRAVADO VENCE O CADASTRO. Se o regime vigente foi
            // assinado pela avó e o aluno tem responsável cadastrado, mostrar o
            // do cadastro na caixa verde faria a tela reescrever a prova em
            // silêncio ao salvar. Divergindo, abre-se direto no modo exceção,
            // com o nome que está no banco. (Painel, enfermeira, 14/08.)
            const gravado = d && d.vigente ? d.vigente.authorizedByFamily : null;
            if (gravado && (!doCadastro || doCadastro.nome !== gravado)) {
                setOutroAutor(true);
            }
            setDados(d);
            // Pré-preenche com o vigente: substituir um regime é o caso comum
            // (a família reviu a autorização), e redigitar tudo convida ao erro.
            if (d && d.vigente) {
                setForm({
                    regimeGeneral: d.vigente.regimeGeneral,
                    regimeSortie: d.vigente.regimeSortie,
                    validFrom: new Date().toISOString().slice(0, 10),
                    validUntil: d.vigente.validUntil || '',
                    authorizedByFamily: d.vigente.authorizedByFamily || '',
                    documentoRef: d.vigente.documentoRef || '',
                    assinadoEm: '',
                    note: ''
                });
            } else {
                setForm(VAZIO);
            }
        } catch (e) {
            setErro(e.message);
            setDados(null);
        } finally {
            setCarregando(false);
        }
    };

    const salvar = async (e) => {
        e.preventDefault();
        if (salvando || !aluno) return;
        setSalvando(true);
        setErro(null);
        try {
            await window.api.salvarRegime({
                userId: aluno.id,
                regimeGeneral: form.regimeGeneral,
                regimeSortie: form.regimeSortie,
                validFrom: form.validFrom || null,
                validUntil: form.validUntil || null,
                // Sem texto livre, vale o responsável do CADASTRO — é a mesma
                // string que o portão exibe, então a prova casa com o registro.
                authorizedByFamily: (!outroAutor && responsavel)
                    ? responsavel.nome
                    : form.authorizedByFamily,
                documentoRef: form.documentoRef || null,
                assinadoEm: form.assinadoEm || null,
                note: form.note || null
            });
            setAviso(t('regime.salvo'));
            await escolher(aluno);
            await carregarResumo();
        } catch (err) {
            setErro(err.message);
        } finally {
            setSalvando(false);
        }
    };

    const encerrar = async () => {
        if (!aluno || !dados?.vigente) return;
        if (!window.confirm(t('regime.form.encerrar.confirma', { nome: aluno.nome }))) return;
        try {
            await window.api.encerrarRegime(aluno.id, null);
            setAviso(t('regime.encerrado'));
            await escolher(aluno);
            await carregarResumo();
        } catch (err) {
            setErro(err.message);
        }
    };

    const dataCurta = (iso) => iso ? new Date(iso).toLocaleDateString(locale) : '—';

    const campo = (rotulo, filho, ajuda) => (
        <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">{rotulo}</label>
            {filho}
            {ajuda && <p className="text-[11px] text-slate-400 mt-1">{ajuda}</p>}
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">

            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack}
                        className="w-10 h-10 rounded-xl bg-white border border-soft-200 shadow-sm flex items-center justify-center hover:bg-soft-50 transition-colors">
                        <LucideIcon name="arrow-left" size={18} className="text-navy-500" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-navy-500 tracking-tight">{t('regime.titulo')}</h1>
                        <p className="text-sm text-slate-400 mt-0.5">{t('regime.subtitulo')}</p>
                    </div>
                </div>
            </div>

            {/* ── Resumo: o número que importa é o que FALTA ────────────── */}
            {resumo && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-2xl p-5 border border-soft-200 shadow-sm">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('regime.kpi.com')}</p>
                        <p className="text-3xl font-black text-success-600 leading-tight">{resumo.comRegime}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-warning-500/40 shadow-sm" title={t('regime.kpi.sem.ajuda')}>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('regime.kpi.sem')}</p>
                        <p className="text-3xl font-black text-warning-600 leading-tight">{resumo.semRegime}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{t('regime.kpi.sem.ajuda')}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-soft-200 shadow-sm">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('regime.kpi.total')}</p>
                        <p className="text-3xl font-black text-navy-500 leading-tight">{resumo.totalAlunos}</p>
                    </div>
                </div>
            )}

            <p className="text-xs text-warning-600 bg-warning-50 border border-warning-500/40 rounded-xl px-4 py-3 mb-6">
                {t('regime.aviso.prova')}
            </p>

            {/* ── Carga em lote ────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-soft-200 shadow-sm p-5 mb-6">
                <p className="font-bold text-navy-500 text-sm mb-1">{t('regime.import.titulo')}</p>
                <p className="text-xs text-slate-500 mb-3">{t('regime.import.instrucao')}</p>
                <ImportColumnList doc={window.MagboImportColumns.regimes()} />

                <div className="flex flex-wrap items-center gap-2 mt-3">
                    <label className="px-4 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold cursor-pointer hover:bg-soft-200">
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={lerArquivo} />
                        {t('regime.import.arquivo')}
                    </label>
                    {importLinhas && (
                        <>
                            <span className="text-xs text-slate-400">
                                {t('regime.import.linhas', { n: importLinhas.length })}
                            </span>
                            <button type="button" onClick={simularImport} disabled={importando}
                                className="px-4 py-2 rounded-xl bg-navy-500 text-white text-sm font-bold disabled:opacity-50">
                                {importando ? t('comum.carregando') : t('regime.import.simular')}
                            </button>
                            {/* Só depois da simulação: confirmar sem ter visto o
                                plano é exatamente o que a disciplina impede. */}
                            <button type="button" onClick={aplicarImport}
                                disabled={importando || !importPlano || importPlano.aplicado}
                                className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                                {t('regime.import.confirmar')}
                            </button>
                            <button type="button" onClick={limparImport}
                                className="px-3 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold">
                                {t('regime.import.descartar')}
                            </button>
                        </>
                    )}
                </div>

                {importErro && (
                    <p className="text-xs text-danger-600 bg-danger-50 border border-danger-500/40 rounded-xl px-3 py-2 mt-3">{importErro}</p>
                )}

                {importPlano && (
                    <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {Object.keys(ACOES_REGIME).map(k => (
                                <span key={k} className={`px-3 py-1 rounded-full text-xs font-bold ${ACOES_REGIME[k]}`}>
                                    {t('plano.regime.' + k)}: {importPlano.totais[k] || 0}
                                </span>
                            ))}
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${importPlano.aplicado ? 'bg-success-100 text-success-600' : 'bg-warning-100 text-warning-600'}`}>
                                {importPlano.aplicado ? t('regime.import.aplicado') : t('regime.import.simulado')}
                            </span>
                        </div>
                        <ListaLimitada
                            titulo={t('regime.import.linhas', { n: importPlano.linhas.length })}
                            total={importPlano.linhas.length}
                            alturaMax="max-h-[40vh]"
                        >
                            {(visiveis) => (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white shadow-sm">
                                        <tr className="text-left text-slate-400 uppercase font-bold">
                                            <th className="py-2 px-2">{t('regime.import.col.linha')}</th>
                                            <th className="py-2 px-2">{t('regime.import.col.aluno')}</th>
                                            <th className="py-2 px-2">{t('journal.filtro.acao')}</th>
                                            <th className="py-2 px-2">{t('regime.import.col.de')}</th>
                                            <th className="py-2 px-2">{t('regime.import.col.para')}</th>
                                            <th className="py-2 px-2">{t('regime.import.col.motivo')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importPlano.linhas.slice(0, visiveis).map((l, i) => (
                                            <tr key={i} className="border-t border-soft-100 align-top">
                                                <td className="py-1.5 px-2 font-mono text-slate-400">L{l.linha}</td>
                                                <td className="py-1.5 px-2 text-navy-500">
                                                    {l.nome || <span className="font-mono text-slate-400">{l.matricula}</span>}
                                                    {l.turma && <span className="text-slate-400 ml-1">{l.turma}</span>}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                    <span className={`px-2 py-0.5 rounded-full font-bold ${ACOES_REGIME[l.acao] || ''}`}>
                                                        {t('plano.regime.' + l.acao)}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 px-2 text-slate-500">{l.regimeAtual || '—'}</td>
                                                <td className="py-1.5 px-2 text-slate-600">{l.regimeNovo || '—'}</td>
                                                <td className="py-1.5 px-2 text-slate-500">{t(l.detalhe)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </ListaLimitada>
                    </div>
                )}
            </div>

            {/* ── Busca ────────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-soft-200 shadow-sm p-5 mb-6">
                <input
                    type="text"
                    value={busca}
                    onChange={e => { setBusca(e.target.value); setAluno(null); setDados(null); }}
                    placeholder={t('regime.busca')}
                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                {resultados.length > 0 && (
                    <div className="mt-2 max-h-56 overflow-y-auto border border-soft-200 rounded-xl">
                        {resultados.map(u => (
                            <button key={u.id} onClick={() => escolher(u)}
                                className="w-full text-left px-4 py-2 text-sm border-b border-soft-100 last:border-0 hover:bg-accent-500/10">
                                <span className="font-bold text-navy-500">{u.nome}</span>
                                <span className="text-slate-400 ml-2 font-mono text-xs">{u.id}</span>
                                <span className="text-slate-400 ml-2 text-xs">{u.turma || '—'}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!aluno && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-2">
                    <LucideIcon name="scroll-text" size={34} className="text-slate-300" />
                    <p className="text-sm">{t('regime.selecione')}</p>
                </div>
            )}

            {aluno && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* ── Vigente + histórico ──────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-soft-200 shadow-sm p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <PersonPhoto userId={aluno.id} nome={aluno.nome}
                                className="w-11 h-11 rounded-full object-cover bg-navy-500 shrink-0" />
                            <div className="min-w-0">
                                <p className="font-bold text-navy-500 truncate">{aluno.nome}</p>
                                <p className="text-xs text-slate-400 font-mono">{aluno.id} · {aluno.turma || '—'}</p>
                            </div>
                        </div>

                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">{t('regime.vigente')}</p>
                        {carregando ? (
                            <p className="text-sm text-slate-400">{t('comum.carregando')}</p>
                        ) : dados?.vigente ? (
                            <div className="rounded-xl border border-success-500/40 bg-success-50 p-4">
                                <p className="font-bold text-navy-500 text-sm">
                                    {window.MagboI18n.tEnum('regimeSortie', dados.vigente.regimeSortie)}
                                </p>
                                <p className="text-xs text-slate-600 mt-0.5">
                                    {window.MagboI18n.tEnum('regimeGeneral', dados.vigente.regimeGeneral)}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-2">
                                    {dataCurta(dados.vigente.validFrom)} → {dados.vigente.validUntil ? dataCurta(dados.vigente.validUntil) : '—'}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                    {t('regime.assinado.por', { nome: dados.vigente.authorizedByFamily })}
                                </p>
                                {dados.vigente.documentoRef && (
                                    <p className="text-[11px] text-slate-400 font-mono">{dados.vigente.documentoRef}</p>
                                )}
                                <button onClick={encerrar}
                                    className="mt-3 px-3 py-1.5 rounded-lg bg-danger-100 text-danger-600 text-xs font-bold hover:bg-danger-500/20">
                                    {t('regime.form.encerrar')}
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-soft-200 bg-soft-50 p-4">
                                <p className="text-sm text-slate-500">{t('regime.nenhum')}</p>
                            </div>
                        )}

                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-5 mb-2">{t('regime.historico')}</p>
                        {(dados?.eventos || []).length === 0 ? (
                            <p className="text-xs text-slate-400">{t('regime.historico.vazio')}</p>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {dados.eventos.map(ev => (
                                    <div key={ev.id} className="text-xs border-l-2 border-soft-300 pl-3 py-1">
                                        <p className="text-slate-600">
                                            {t('regime.historico.de.para', {
                                                de: ev.oldRegimeSortie
                                                    ? window.MagboI18n.tEnum('regimeSortie', ev.oldRegimeSortie)
                                                    : t('regime.nenhum'),
                                                para: ev.newRegimeSortie
                                                    ? window.MagboI18n.tEnum('regimeSortie', ev.newRegimeSortie)
                                                    : t('regime.encerrado')
                                            })}
                                        </p>
                                        <p className="text-slate-400">
                                            {new Date(ev.changedAt).toLocaleString(locale)} · {ev.changedBy}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Formulário ───────────────────────────────────── */}
                    <form onSubmit={salvar} className="bg-white rounded-2xl border border-soft-200 shadow-sm p-5 space-y-4">
                        <p className="font-bold text-navy-500 text-sm">{t('regime.form.titulo')}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {campo(t('regime.form.geral'),
                                <select value={form.regimeGeneral}
                                    onChange={e => setForm({ ...form, regimeGeneral: e.target.value })}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm">
                                    <option value="EXTERNE">{t('enum.regimeGeneral.EXTERNE')}</option>
                                    <option value="DEMI_PENSIONNAIRE">{t('enum.regimeGeneral.DEMI_PENSIONNAIRE')}</option>
                                    <option value="INTERNE">{t('enum.regimeGeneral.INTERNE')}</option>
                                </select>)}

                            {campo(t('regime.form.sortie'),
                                <select value={form.regimeSortie}
                                    onChange={e => setForm({ ...form, regimeSortie: e.target.value })}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm">
                                    <option value="REGIME_1">{t('enum.regimeSortie.REGIME_1')}</option>
                                    <option value="REGIME_2">{t('enum.regimeSortie.REGIME_2')}</option>
                                    <option value="REGIME_3">{t('enum.regimeSortie.REGIME_3')}</option>
                                </select>)}

                            {campo(t('regime.form.de'),
                                <input type="date" value={form.validFrom} required
                                    onChange={e => setForm({ ...form, validFrom: e.target.value })}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm" />)}

                            {campo(t('regime.form.ate'),
                                <input type="date" value={form.validUntil}
                                    onChange={e => setForm({ ...form, validUntil: e.target.value })}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm" />,
                                t('regime.form.ate.ajuda'))}
                        </div>

                        {campo(t('regime.form.familia'),
                            <div className="space-y-2">
                                {responsavel && !outroAutor ? (
                                    <>
                                        {/* O nome que o cadastro já tem. Sem digitação. */}
                                        <div className="flex items-center gap-2 bg-success-50 border border-success-500/40 rounded-xl px-3 py-2">
                                            <LucideIcon name="user-check" size={16} className="text-success-600 shrink-0" />
                                            <span className="text-sm font-bold text-navy-500 truncate">{responsavel.nome}</span>
                                            {responsavel.parentesco && (
                                                <span className="text-xs text-slate-400">{responsavel.parentesco}</span>
                                            )}
                                        </div>
                                        <button type="button"
                                            onClick={() => { setOutroAutor(true); setForm({ ...form, authorizedByFamily: '' }); }}
                                            className="text-xs font-bold text-accent-600 underline hover:no-underline">
                                            {t('regime.form.familia.outro')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <input type="text" value={form.authorizedByFamily} required
                                            placeholder={t('regime.form.familia.exemplo')}
                                            onChange={e => setForm({ ...form, authorizedByFamily: e.target.value })}
                                            className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm" />
                                        {/* ⚠️ A EXCEÇÃO APARECE COMO EXCEÇÃO. Quem assina sem ser o
                                            responsável cadastrado é o caso que alguém vai querer
                                            conferir depois; deixá-lo com a mesma cara da rotina
                                            esconderia justamente o que merece atenção. */}
                                        {responsavel && (
                                            <p className="text-[11px] text-warning-600 bg-warning-50 border border-warning-500/40 rounded-lg px-3 py-2">
                                                {t('regime.form.familia.excecao', { nome: responsavel.nome })}
                                                {' '}
                                                <button type="button" onClick={() => { setOutroAutor(false); setForm({ ...form, authorizedByFamily: '' }); }}
                                                    className="font-bold underline hover:no-underline">
                                                    {t('regime.form.familia.voltar')}
                                                </button>
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>)}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {campo(t('regime.form.documento'),
                                <input type="text" value={form.documentoRef}
                                    placeholder={t('regime.form.documento.exemplo')}
                                    onChange={e => setForm({ ...form, documentoRef: e.target.value })}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm" />)}

                            {campo(t('regime.form.assinado'),
                                <input type="date" value={form.assinadoEm}
                                    onChange={e => setForm({ ...form, assinadoEm: e.target.value })}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm" />)}
                        </div>

                        {campo(t('regime.form.nota'),
                            <input type="text" value={form.note}
                                onChange={e => setForm({ ...form, note: e.target.value })}
                                className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm" />)}

                        {erro && (
                            <p className="text-xs text-danger-600 bg-danger-50 border border-danger-500/40 rounded-xl px-3 py-2">{erro}</p>
                        )}
                        {aviso && (
                            <p className="text-xs text-success-600 bg-success-50 border border-success-500/40 rounded-xl px-3 py-2">{aviso}</p>
                        )}

                        <button type="submit" disabled={salvando || (outroAutor && !form.authorizedByFamily.trim()) || (!responsavel && !form.authorizedByFamily.trim())}
                            className="w-full py-3 bg-accent-500/100 text-white font-bold rounded-xl hover:bg-accent-600 transition-colors disabled:opacity-50">
                            {salvando ? t('comum.salvando') : t('regime.form.salvar')}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
