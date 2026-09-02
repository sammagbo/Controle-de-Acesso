// =====================================================================
// APP SETTINGS & REGISTRATION MODAL
// =====================================================================

// Especificações de servidor sugeridas. É datalist e não select: o backend
// guarda `departamento` como texto livre justamente porque a lista de setores
// muda por decisão administrativa, não por deploy.
const DEPARTAMENTOS_SUGERIDOS = [
    'Professor',
    'Vie Scolaire',
    'Serviços Gerais',
    'Administração',
    'Direção',
    'Manutenção',
    'Cantina',
    'Portaria',
    'CDI'
];

/** Tipos que são servidor da escola — o resto segue o fluxo antigo. */
const TIPOS_DE_SERVIDOR = ['PROFESSOR', 'FUNCIONARIO'];

/** id do formulário de cadastro manual — o botão vive na barra de ação, fora dele. */
const FORM_CADASTRO_MANUAL = 'magbo-form-cadastro-manual';

// ListaLimitada mora agora em js/components/ListaLimitada.js — a importação de
// direitos de refeição precisa do mesmo teto de renderização, e ela carrega
// ANTES deste arquivo no index.html.

function AppSettingsModal({ onClose, onShowToast }) {
    const t = useI18n();
    // ⚠️ QUEM VÊ O QUÊ (28/08). O modal tem dois públicos desde que a
    // «Configuration du système» mudou-se para cá: o ADMIN vê tudo, e o
    // portador de CONFIG_WRITE sem ser admin vê UMA aba — a configuração.
    // As abas de administração (importações, servidores, fotos, cadastro)
    // continuam exclusivas do admin: nada delas se abriu junto.
    const ehAdmin = !!(window.auth && window.auth.isAdmin && window.auth.isAdmin());
    const podeConfig = !!(window.MagboPermissions
        && window.MagboPermissions.canWrite(window.auth, 'CONFIG_WRITE'));
    // O admin cai na aba de sempre; quem só tem CONFIG_WRITE cai na única
    // aba que existe para ele — sem isto, abriria um modal em branco.
    const [activeTab, setActiveTab] = React.useState(ehAdmin ? 'import' : 'config');

    // --- Manual Registration State ---
    const [manualForm, setManualForm] = React.useState({
        nome: '',
        tipo: 'ALUNO',
        turma: '',
        horario_saida: '',
        parentesco: '',
        telefone: '',
        responsavel_id: '',
        // Servidores
        matricula: '',
        hikvision_employee_id: '',
        departamento: ''
    });
    const [submitting, setSubmitting] = React.useState(false);
    const [proximaMatricula, setProximaMatricula] = React.useState('');
    const [staffImportErrors, setStaffImportErrors] = React.useState([]);
    // Import do HikCentral: linhas lidas, plano simulado e trava do "gravando".
    const [hikRows, setHikRows] = React.useState([]);
    const [hikPlan, setHikPlan] = React.useState(null);
    const [hikApplying, setHikApplying] = React.useState(false);
    // Lista de servidores (aba "Servidores")
    const [staffRows, setStaffRows] = React.useState([]);
    const [staffLoading, setStaffLoading] = React.useState(false);
    const [staffQuery, setStaffQuery] = React.useState('');
    const [staffEdit, setStaffEdit] = React.useState(null);   // { id, tipo, departamento }
    // Importação de FOTOS: arquivos escolhidos, plano simulado e trava do "gravando".
    // ⚠️ São fotos de menores — nada aqui é enviado antes da confirmação
    // explícita, e o plano mostrado é uma SIMULAÇÃO que não grava um byte.
    const [fotoArquivos, setFotoArquivos] = React.useState([]);
    const [fotoZip, setFotoZip] = React.useState(null);
    const [fotoPlan, setFotoPlan] = React.useState(null);
    const [fotoBusy, setFotoBusy] = React.useState(false);
    const [fotoResumo, setFotoResumo] = React.useState(null);
    // "É na verdade um aluno": reaproveita a busca e a prévia lado a lado do
    // CONFERIR, partindo do registro de SERVIDOR em vez do identificador.
    const [reclassRow, setReclassRow] = React.useState(null);
    const [reclassQuery, setReclassQuery] = React.useState('');
    const [reclassResults, setReclassResults] = React.useState([]);
    const [reclassChoice, setReclassChoice] = React.useState(null);
    const [reclassPreview, setReclassPreview] = React.useState(null);
    const [reclassSubstituir, setReclassSubstituir] = React.useState(false);
    const [reclassSaving, setReclassSaving] = React.useState(false);
    const [reclassErro, setReclassErro] = React.useState(null);
    // Casamento manual (aba HikCentral, lista CONFERIR)
    const [matchRow, setMatchRow] = React.useState(null);     // linha do CONFERIR
    const [matchQuery, setMatchQuery] = React.useState('');
    const [matchResults, setMatchResults] = React.useState([]);
    const [matchChoice, setMatchChoice] = React.useState(null);
    const [matchPreview, setMatchPreview] = React.useState(null);
    const [matchSaving, setMatchSaving] = React.useState(false);
    const [matchDone, setMatchDone] = React.useState({});     // idHikvision -> matrícula casada

    const ehServidor = TIPOS_DE_SERVIDOR.includes(manualForm.tipo);

    // Mostra qual matrícula será emitida se o campo ficar em branco — sem isso
    // o operador não tem como saber o que o sistema vai gravar.
    React.useEffect(() => {
        if (!ehServidor) return;
        let vivo = true;
        window.api.fetchNextStaffMatricula()
            .then(m => { if (vivo) setProximaMatricula(m); })
            .catch(() => { if (vivo) setProximaMatricula(''); });
        return () => { vivo = false; };
    }, [ehServidor]);

    // ── Comportamento de tela cheia sobreposta ────────────────────────────
    // A tela cobre o app inteiro; enquanto está aberta ela é o único alvo de
    // teclado e de rolagem. Sem isto o operador rolava a tela DE TRÁS achando
    // que rolava o conteúdo — e ficava preso do mesmo jeito.
    const containerRef = React.useRef(null);
    const fecharRef = React.useRef(null);
    const conteudoRef = React.useRef(null);

    // Trocar de aba volta ao topo. Sem isto, quem estava no fim do relatório do
    // HikCentral clicava em "Cadastro Manual" e caía no meio do formulário, com
    // o campo Nome fora de vista.
    React.useEffect(() => {
        if (conteudoRef.current) conteudoRef.current.scrollTop = 0;
    }, [activeTab]);

    // Trava a rolagem do documento e devolve exatamente como estava.
    React.useEffect(() => {
        const anterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = anterior; };
    }, []);

    // Foco inicial no botão de fechar: a saída fica a um Enter de distância,
    // que é o oposto do que acontecia (só Ctrl+R saía).
    React.useEffect(() => {
        fecharRef.current?.focus();
    }, []);

    /**
     * Esc fecha; Tab circula DENTRO da tela.
     *
     * O foco preso não é enfeite de acessibilidade aqui: sem ele o Tab desce
     * para os botões do app de trás, que estão visualmente cobertos — o
     * operador digita às cegas em outra tela.
     */
    React.useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;

            const foco = containerRef.current?.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
                + ' textarea:not([disabled]), details, summary, [tabindex]:not([tabindex="-1"])'
            );
            if (!foco || foco.length === 0) return;
            // offsetParent null = elemento escondido (aba inativa): não pode
            // receber foco, senão o Tab "some" dentro de uma aba que ninguém vê.
            const visiveis = Array.from(foco).filter(el => el.offsetParent !== null);
            if (visiveis.length === 0) return;

            const primeiro = visiveis[0];
            const ultimo = visiveis[visiveis.length - 1];
            if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primeiro.focus();
            } else if (e.shiftKey && document.activeElement === primeiro) {
                e.preventDefault();
                ultimo.focus();
            } else if (!containerRef.current.contains(document.activeElement)) {
                // Foco escapou (clique fora, aba trocada): traz de volta.
                e.preventDefault();
                primeiro.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [onClose]);

    const [isFullscreen, setIsFullscreen] = React.useState(!!document.fullscreenElement);

    React.useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                onShowToast({ title: t('cfg.erro'), message: t('cfg.gerais.telacheia.erro'), type: 'error' });
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    // --- Tab Content Renderers ---

    const renderGeneralSettings = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                <h3 className="text-lg font-bold text-navy-500 mb-2">{t('cfg.gerais.titulo')}</h3>
                <p className="text-sm text-slate-500 mb-6">{t('cfg.gerais.sub')}</p>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-soft-200">
                        <div>
                            <p className="font-bold text-navy-500">{t('cfg.gerais.telacheia')}</p>
                            <p className="text-xs text-slate-400">{t('cfg.gerais.telacheia.sub')}</p>
                        </div>
                        <button 
                            onClick={toggleFullscreen}
                            className={`w-12 h-6 rounded-full relative transition-colors ${isFullscreen ? 'bg-accent-500' : 'bg-slate-200'}`}
                        >
                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isFullscreen ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = evt.target.result;
                const workbook = window.XLSX.read(data, { type: 'binary' });

                // Procura aba "Cadastro" ou usa a primeira
                const sheetName = workbook.SheetNames.includes('Cadastro')
                    ? 'Cadastro'
                    : workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                // Validação básica antes de enviar
                const validRows = json.filter(row => row.Nome && String(row.Nome).trim() !== '');
                if (validRows.length === 0) {
                    onShowToast({ title: t('cfg.imp.vazia'), message: t('cfg.imp.vazia.detalhe'), type: 'error' });
                    return;
                }

                // Mapeia para o formato do backend (UserRegistrationDto)
                const payload = validRows.map(row => ({
                    id: row.ID ? String(row.ID).trim() : '',
                    nome: String(row.Nome).trim(),
                    tipo: row.Tipo ? String(row.Tipo).trim().toUpperCase() : 'ALUNO',
                    turma: row.Turma ? String(row.Turma).trim() : '',
                    responsavelId: row.ResponsavelId ? String(row.ResponsavelId).trim() : '',
                    parentesco: row.Parentesco ? String(row.Parentesco).trim() : '',
                    telefone: row.Telefone ? String(row.Telefone).trim() : '',
                    fotoUrl: row.Foto ? String(row.Foto).trim() : ''
                }));

                onShowToast({ title: t('cfg.imp.enviando'), message: t('cfg.enviando.n', { n: payload.length }), type: 'info' });

                const result = await window.api.createUsersBulk(payload);

                // Recarrega cache para refletir no UI
                if (window.userCache && window.userCache.reload) {
                    await window.userCache.reload();
                }

                // Feedback detalhado
                if (result.status === 'success') {
                    onShowToast({
                        title: t('cfg.imp.ok'),
                        message: t('cfg.imp.ok.detalhe', { n: result.sucesso }),
                        type: 'success'
                    });
                } else {
                    const detalhes = (result.detalheErros || [])
                        .slice(0, 5)
                        .map(e => `Linha ${e.linha} (${e.nome}): ${e.erro}`)
                        .join('\n');
                    console.warn('Erros na importação:', result.detalheErros);
                    onShowToast({
                        title: t('cfg.imp.parcial', { ok: result.sucesso, total: result.totalRecebido }),
                        message: t('cfg.imp.parcial.detalhe', { n: result.falhas }),
                        type: 'warning'
                    });
                }
            } catch (err) {
                console.error('Erro na importação:', err);
                onShowToast({
                    title: t('cfg.erro'),
                    message: err.message || t('cfg.imp.falha.arquivo'),
                    type: 'error'
                });
            } finally {
                e.target.value = ''; // Reseta o input para permitir selecionar o mesmo arquivo novamente
            }
        };
        reader.readAsBinaryString(file);
    };

    const renderImportSettings = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                <h3 className="text-lg font-bold text-navy-500 mb-2">{t('cfg.imp.titulo')}</h3>
                <div className="text-sm text-slate-500 mb-6">
                    {t('cfg.imp.instrucao.a')} <strong>.xlsx</strong> {t('cfg.imp.instrucao.b')}
                    <ImportColumnList doc={window.MagboImportColumns.ALUNOS} />
                    <p className="text-xs mt-2">{t('cfg.imp.template')}</p>
                </div>

                <div className="border-2 border-dashed border-accent-200 rounded-2xl p-8 text-center bg-white hover:bg-accent-50 transition-colors relative group">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleFileUpload}
                    />
                    <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4 text-accent-600 group-hover:scale-110 transition-transform">
                        <LucideIcon name="file-spreadsheet" size={32} />
                    </div>
                    <p className="font-bold text-navy-500">{t('cfg.imp.arraste')}</p>
                    <p className="text-sm text-slate-400 mt-1">{t('cfg.formatos')}</p>
                </div>
            </div>
        </div>
    );

    const limparFormulario = (tipo) => setManualForm({
        nome: '', tipo, turma: '', horario_saida: '', parentesco: '', telefone: '',
        responsavel_id: '', matricula: '', hikvision_employee_id: '', departamento: ''
    });

    /**
     * Lê o export "Renseignements personnels" do HikCentral.
     *
     * ⚠️ O CABEÇALHO ESTÁ NA LINHA 9 — as 8 primeiras são instruções do próprio
     * HCP. `range: 8` (0-indexado) manda o xlsx começar a ler dali; sem isso as
     * colunas viriam com nomes como "__EMPTY_3" e o arquivo inteiro seria lido
     * como lixo.
     *
     * Colunas casadas pelo NOME e não pela posição: o HCP reordena/acrescenta
     * coluna entre versões, e posição fixa quebra em silêncio.
     *
     * Tudo lido como TEXTO (`raw: false`): a matrícula do aluno tem zeros à
     * esquerda (0004486) e o xlsx a converteria em número, comendo o zero —
     * e aí nenhuma linha casaria com app_users.
     *
     * A interpretação (prefixo do Service, tipo, regra do ID) fica no BACKEND,
     * onde há teste. Aqui só se localiza o cabeçalho e se copiam os campos.
     */
    const lerPlanilhaHikCentral = (evt) => {
        const workbook = window.XLSX.read(evt.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // Opções de leitura e mapeamento das colunas vivem em
        // js/utils/hikcentralSheet.js: é a parte que erra em SILÊNCIO se o HCP
        // mudar o arquivo (coluna trocada de lugar, acento diferente, matrícula
        // lida como número), então mora num módulo com teste (`npm test`) em
        // vez de escondida dentro do componente.
        const json = window.XLSX.utils.sheet_to_json(sheet, window.MagboHikSheet.sheetOptions());
        return window.MagboHikSheet.mapRows(json);
    };

    const handleHikCentralFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const rows = lerPlanilhaHikCentral(evt);
                if (rows.length === 0) {
                    onShowToast({
                        title: t('cfg.hik.nao.reconhecida'),
                        message: t('cfg.hik.nao.reconhecida.detalhe'),
                        type: 'error'
                    });
                    return;
                }

                setHikRows(rows);
                setHikPlan(null);
                onShowToast({
                    title: t('cfg.hik.conferindo'),
                    message: t('cfg.hik.conferindo.detalhe', { n: rows.length }),
                    type: 'info'
                });
                setHikPlan(await window.api.previewHikCentralImport(rows));
            } catch (err) {
                console.error('Erro ao ler o export do HikCentral:', err);
                onShowToast({ title: t('cfg.erro'), message: err.message || t('cfg.hik.falha.ler'), type: 'error' });
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const confirmarImportHikCentral = async () => {
        if (!hikRows.length || hikApplying) return;
        setHikApplying(true);
        try {
            const relatorio = await window.api.applyHikCentralImport(hikRows);
            setHikPlan(relatorio);
            if (window.userCache?.reload) await window.userCache.reload();
            const tot = relatorio.totais || {};
            onShowToast({
                title: t('cfg.hik.aplicada'),
                message: t('cfg.hik.aplicada.detalhe', {
                    criar: tot.CRIAR || 0, atualizar: tot.ATUALIZAR || 0,
                    ignorar: tot.PULAR || 0, conflitos: tot.CONFLITO || 0,
                    conferir: tot.REVISAO_MANUAL || 0
                }),
                type: (tot.CONFLITO || tot.REVISAO_MANUAL) ? 'warning' : 'success'
            });
        } catch (err) {
            console.error(err);
            onShowToast({ title: t('cfg.hik.nao.aplicada'), message: err.message, type: 'error' });
        } finally {
            setHikApplying(false);
        }
    };

    // ── F7b: gerar o CSV que a TI importa no HikCentral ──────────────────
    // Caminho INVERSO do import desta mesma aba. O aluno sem identificador
    // Hikvision é reconhecido pelo terminal e negado pelo MAGBO em toda
    // passagem; este arquivo é o que faz a TI cadastrá-lo no HCP.
    const [exportando, setExportando] = React.useState(false);

    const exportarCsvHikCentral = async (escopo) => {
        if (exportando) return;
        setExportando(true);
        try {
            const r = await window.api.exportHikCentralCsv(escopo);
            onShowToast({
                title: r.linhas === 0 ? t('cfg.csv.nada') : t('cfg.csv.gerado'),
                message: r.linhas === 0
                    ? t('cfg.csv.nenhum')
                    : t('cfg.csv.gerado.detalhe', { n: r.linhas, arquivo: r.nomeArquivo }),
                type: r.linhas === 0 ? 'info' : 'success'
            });
        } catch (e) {
            onShowToast({ title: t('cfg.csv.erro'), message: e.message, type: 'error' });
        } finally {
            setExportando(false);
        }
    };

    const ACOES_HIK = {
        CRIAR: { label: t('plano.acao.criar'), cor: 'text-success-700 bg-success-100' },
        ATUALIZAR: { label: t('plano.acao.atualizar'), cor: 'text-accent-700 bg-accent-100' },
        PULAR: { label: t('plano.acao.ignorar'), cor: 'text-slate-600 bg-soft-100' },
        CONFLITO: { label: t('plano.acao.conflito'), cor: 'text-danger-700 bg-danger-100' },
        REVISAO_MANUAL: { label: t('plano.acao.conferir'), cor: 'text-amber-700 bg-amber-100' }
    };

    // ── Aba "Servidores": manutenção do cadastro ─────────────────────────

    const carregarServidores = React.useCallback(async () => {
        setStaffLoading(true);
        try {
            setStaffRows(await window.api.listStaff());
        } catch (e) {
            onShowToast({ title: t('cfg.erro'), message: e.message, type: 'error' });
        } finally {
            setStaffLoading(false);
        }
    }, [onShowToast]);

    React.useEffect(() => {
        if (activeTab === 'staff-list' && ehAdmin) carregarServidores();
    }, [activeTab, carregarServidores]);

    const salvarServidor = async () => {
        if (!staffEdit) return;
        try {
            const r = await window.api.updateStaff(staffEdit.id, {
                tipo: staffEdit.tipo, departamento: staffEdit.departamento,
                // Sempre enviado a partir daqui (string vazia = limpar): este
                // formulário é a única porta de escrita do posto, e é ele quem
                // acabou de mostrar o valor ao operador.
                postoFixoPointId: staffEdit.postoFixoPointId || ''
            });
            onShowToast({ title: t('cfg.srv.atualizado'), message: r.message, type: 'success' });
            setStaffEdit(null);
            await carregarServidores();
            if (window.userCache?.reload) await window.userCache.reload();
        } catch (e) {
            onShowToast({ title: t('cfg.srv.nao.salvo'), message: e.message, type: 'error' });
        }
    };

    const acaoServidor = async (row, acao) => {
        // Remoção é irreversível; inativar não. Só a primeira pede confirmação.
        if (acao === 'delete' && !window.confirm(
            t('cfg.srv.confirmar.remocao', { nome: row.nome, id: row.id }))) return;
        try {
            const r = acao === 'delete' ? await window.api.deleteStaff(row.id)
                : acao === 'deactivate' ? await window.api.deactivateStaff(row.id)
                : await window.api.reactivateStaff(row.id);
            onShowToast({ title: t('cfg.srv.feito'), message: r.message, type: 'success' });
            await carregarServidores();
            if (window.userCache?.reload) await window.userCache.reload();
        } catch (e) {
            // O backend recusa a remoção com histórico e explica o porquê.
            onShowToast({ title: t('cfg.srv.nao.realizada'), message: e.message, type: 'error' });
        }
    };

    const servidoresFiltrados = React.useMemo(() => {
        const q = staffQuery.trim().toLowerCase();
        if (!q) return staffRows;
        return staffRows.filter(r =>
            String(r.nome || '').toLowerCase().includes(q)
            || String(r.id || '').toLowerCase().includes(q)
            || String(r.departamento || '').toLowerCase().includes(q)
            || String(r.hikvisionEmployeeId || '').includes(q));
    }, [staffRows, staffQuery]);

    // ── "Este servidor é na verdade um aluno" ────────────────────────────
    // 74 alunos estavam fora do departamento ALUNOS no HikCentral com id de 10
    // dígitos: a importação criou FUNC-### segurando a face deles e as
    // passagens entravam como de servidor. A correção em massa foi por SQL;
    // isto é a ferramenta para o próximo caso.

    const abrirReclass = (row) => {
        setReclassRow(row);
        setReclassQuery(row.nome || '');   // o nome é o único elo com o cadastro
        setReclassResults([]);
        setReclassChoice(null);
        setReclassPreview(null);
        setReclassSubstituir(false);
        setReclassErro(null);
    };

    React.useEffect(() => {
        if (!reclassRow) return;
        const q = reclassQuery.trim();
        if (q.length < 2) { setReclassResults([]); return; }
        let vivo = true;
        const tid = setTimeout(async () => {
            try {
                const achados = await window.userCache.search(q, 20);
                if (vivo) setReclassResults((achados || []).filter(u => u.tipo === 'ALUNO'));
            } catch (e) { if (vivo) setReclassResults([]); }
        }, 250);
        return () => { vivo = false; clearTimeout(tid); };
    }, [reclassQuery, reclassRow]);

    const escolherAlunoReclass = async (aluno) => {
        setReclassChoice(aluno);
        setReclassPreview(null);
        setReclassSubstituir(false);
        setReclassErro(null);
        try {
            const r = await window.api.previewReclassify(reclassRow.id, aluno.id);
            setReclassPreview(r.preview);
        } catch (e) {
            // Inclui o caso "aluno não está no MAGBO", que precisa aparecer
            // dentro do painel — um toast some antes de o operador ler o que
            // fazer a respeito.
            setReclassErro(e.message);
        }
    };

    const confirmarReclass = async () => {
        if (!reclassChoice || !reclassRow || reclassSaving) return;
        setReclassSaving(true);
        try {
            const r = await window.api.reclassifyStaffAsStudent(
                reclassRow.id, reclassChoice.id, reclassSubstituir);
            onShowToast({ title: 'Reclassificado', message: r.message, type: 'success' });
            setReclassRow(null);
            await carregarServidores();
            if (window.userCache?.reload) await window.userCache.reload();
        } catch (e) {
            setReclassErro(e.message);
        } finally {
            setReclassSaving(false);
        }
    };

    const renderReclass = () => {
        if (!reclassRow) return null;
        const p = reclassPreview;
        // Máquina de estados em js/utils/importPlan.js, com teste: uma face vai
        // trocar de dono, e o botão habilitado cedo demais grava sem que o
        // operador tenha visto os dois lados.
        const st = window.MagboImportPlan.reclassState({
            query: reclassQuery, resultados: reclassResults, escolhido: reclassChoice,
            previa: p, substituir: reclassSubstituir, salvando: reclassSaving, erro: reclassErro
        });
        return (
            <div className="border-2 border-accent-300 bg-white rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="font-bold text-navy-500 text-sm">
                            "{reclassRow.nome}" {t('cfg.rec.titulo')}
                        </p>
                        <p className="text-[11px] text-slate-500">
                            {reclassRow.id}
                            {reclassRow.hikvisionEmployeeId
                                ? <> · {t('cfg.face')} <span className="font-mono">{reclassRow.hikvisionEmployeeId}</span></>
                                : ' · ' + t('cfg.sem.id.hikvision')}
                            {' · '}{t('cfg.passagens', { n: reclassRow.passagens })}
                        </p>
                    </div>
                    <button onClick={() => setReclassRow(null)}
                        className="text-xs font-bold text-slate-500 underline hover:no-underline">{t('acao.fechar')}</button>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                        {t('cfg.rec.procurar')}
                    </label>
                    <input type="text" value={reclassQuery} onChange={e => setReclassQuery(e.target.value)}
                        className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
                </div>

                {st.mostrarLista && (
                    <div className="max-h-40 overflow-y-auto border border-soft-200 rounded-xl">
                        {reclassResults.map(a => (
                            <button key={a.id} onClick={() => escolherAlunoReclass(a)}
                                className="w-full text-left px-3 py-2 text-xs border-b border-soft-100 last:border-0 hover:bg-accent-50">
                                <span className="font-bold text-navy-500">{a.nome}</span>
                                <span className="text-slate-400 ml-2 font-mono">{a.id}</span>
                                <span className="text-slate-400 ml-2">{a.turma || '—'}</span>
                                {a.hikvision_employee_id && (
                                    <span className="ml-2 text-amber-700">{t('cfg.ja.tem.face')} {a.hikvision_employee_id}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {st.mostrarAusente && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        {t('cfg.rec.ausente')}
                    </p>
                )}

                {st.mostrarErro && (
                    <p className="text-[11px] text-danger-700 bg-danger-50 border border-danger-200 rounded-xl px-3 py-2">
                        {reclassErro}
                    </p>
                )}

                {/* Os dois lados ANTES de gravar: é uma face trocando de dono. */}
                {st.mostrarPrevia && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="border border-success-200 bg-success-50 rounded-xl p-3">
                            <p className="text-[11px] font-bold text-success-700 uppercase mb-1">{t('cfg.rec.aluno.titulo')}</p>
                            <p className="font-bold text-navy-500 text-sm">{p.alunoNome}</p>
                            <p className="text-[11px] text-slate-600 font-mono">{p.alunoId}</p>
                            <p className="text-[11px] text-slate-600">{t('comum.turma')}: {p.alunoTurma || '—'}</p>
                            <p className="text-[11px] text-slate-600">
                                {t('cfg.id.atual')}: {p.alunoHikvisionAtual || t('cfg.nenhum')}
                                {p.servidorHikvisionId && <> → <span className="font-mono font-bold">{p.servidorHikvisionId}</span></>}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{t('cfg.rec.nao.alterados')}</p>
                        </div>
                        <div className="border border-danger-200 bg-danger-50 rounded-xl p-3">
                            <p className="text-[11px] font-bold text-danger-700 uppercase mb-1">{t('cfg.rec.servidor.titulo')}</p>
                            <p className="font-bold text-navy-500 text-sm">{p.servidorNome}</p>
                            <p className="text-[11px] text-slate-600 font-mono">{p.servidorId}</p>
                            <p className="text-[11px] text-slate-600">{t('cfg.col.departamento')}: {p.servidorDepartamento || '—'}</p>
                            <p className="text-[11px] text-slate-600">
                                {t('cfg.passagens', { n: p.servidorPassagens })} — <strong>{t('cfg.rec.ficam')}</strong>
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">{t('cfg.rec.inativo.sai')}</p>
                        </div>
                    </div>
                )}

                {/* Substituição consciente: o aluno já tem outra face ligada. */}
                {st.exigeSubstituicao && (
                    <label className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={reclassSubstituir}
                            onChange={e => setReclassSubstituir(e.target.checked)}
                            className="mt-0.5 w-3.5 h-3.5 accent-amber-600" />
                        <span>
                            {t('cfg.rec.subst.a')} <span className="font-mono">{p.alunoHikvisionAtual}</span>.
                            {' '}{t('cfg.rec.subst.b')} <span className="font-mono">{p.servidorHikvisionId}</span> —
                            {' '}{t('cfg.rec.subst.c')}
                        </span>
                    </label>
                )}

                {st.mostrarBotoes && (
                    <div className="flex gap-2">
                        <button
                            onClick={confirmarReclass}
                            disabled={!st.podeConfirmar}
                            className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            {t(st.rotuloConfirmar)}
                        </button>
                        <button onClick={() => { setReclassChoice(null); setReclassPreview(null); setReclassErro(null); }}
                            className="px-4 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200">
                            {t('cfg.escolher.outro')}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // ── Aba "Fotos": importação em lote ──────────────────────────────────
    // Mesma disciplina do import do HikCentral: SIMULA primeiro, mostra o que
    // aconteceria linha a linha, e só grava com confirmação explícita. Aqui a
    // disciplina pesa mais — são retratos de crianças, e uma foto no cadastro
    // errado é a portaria liberando a saída no nome de outro.

    const carregarResumoDeFotos = React.useCallback(async () => {
        try {
            setFotoResumo(await window.api.fetchPhotoSummary());
        } catch (e) {
            setFotoResumo(null);
        }
    }, []);

    React.useEffect(() => {
        if (activeTab === 'photos' && ehAdmin) carregarResumoDeFotos();
    }, [activeTab, carregarResumoDeFotos]);

    const limparEscolhaDeFotos = () => {
        setFotoArquivos([]);
        setFotoZip(null);
        setFotoPlan(null);
    };

    const escolherFotos = (e) => {
        const lista = Array.from(e.target.files || []);
        setFotoZip(null);
        setFotoArquivos(lista);
        setFotoPlan(null);
    };

    const escolherZipDeFotos = (e) => {
        const arquivo = (e.target.files || [])[0] || null;
        setFotoArquivos([]);
        setFotoZip(arquivo);
        setFotoPlan(null);
    };

    /** @param aplicar false = simulação (não grava nada) */
    const rodarImportacaoDeFotos = async (aplicar) => {
        if (fotoBusy) return;
        if (!fotoZip && fotoArquivos.length === 0) return;
        setFotoBusy(true);
        try {
            const plano = fotoZip
                ? await window.api.importPhotosZip(fotoZip, aplicar)
                : await window.api.importPhotos(fotoArquivos, aplicar);
            setFotoPlan(plano);
            if (aplicar) {
                onShowToast({
                    title: t('cfg.foto.importadas'),
                    message: t('cfg.foto.importadas.detalhe', {
                        novas: plano.totais.CRIAR || 0,
                        atualizadas: plano.totais.ATUALIZAR || 0,
                        semdono: plano.totais.SEM_CORRESPONDENCIA || 0
                    }),
                    type: 'success'
                });
                // O cache guarda objectURLs por pessoa: sem esta limpeza, quem
                // acabou de receber foto continuaria com o avatar de iniciais
                // até o app reiniciar.
                if (window.MagboPhotoCache) window.MagboPhotoCache.clear();
                await carregarResumoDeFotos();
            }
        } catch (e) {
            onShowToast({ title: t('cfg.foto.nao.realizada'), message: e.message, type: 'error' });
        } finally {
            setFotoBusy(false);
        }
    };

    const FOTO_ACAO_LABEL = {
        CRIAR: { label: t('plano.foto.nova'), cor: 'text-success-700 bg-success-100' },
        ATUALIZAR: { label: t('plano.foto.substitui'), cor: 'text-accent-700 bg-accent-100' },
        PULAR: { label: t('plano.foto.igual'), cor: 'text-slate-600 bg-soft-100' },
        SEM_CORRESPONDENCIA: { label: t('plano.foto.semdono'), cor: 'text-amber-700 bg-amber-100' },
        CONFLITO: { label: t('plano.acao.conflito'), cor: 'text-danger-700 bg-danger-100' },
        RECUSADO: { label: t('plano.foto.recusado'), cor: 'text-danger-700 bg-danger-100' }
    };

    const renderPhotoImport = () => {
        const escolhidos = fotoZip ? 1 : fotoArquivos.length;
        const tot = fotoPlan?.totais || {};
        return (
            <div className="space-y-4 animate-fade-in">
                <div className="bg-soft-50 p-4 rounded-2xl border border-soft-200">
                    <h3 className="text-lg font-bold text-navy-500 mb-1">{t('cfg.foto.titulo')}</h3>
                    <div className="text-xs text-slate-500">
                        {t('cfg.foto.instrucao')}
                        <ImportColumnList doc={window.MagboImportColumns.FOTOS} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        <strong>{t('cfg.foto.nada.gravado')}</strong> {t('cfg.foto.simulacao')}
                    </p>
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                        {t('cfg.foto.menores')}
                    </p>
                    {fotoResumo && (
                        <p className="text-xs text-slate-500 mt-2">
                            {t('cfg.foto.resumo.a')} <strong className="text-navy-500">{fotoResumo.comFoto}</strong> {t('cfg.foto.resumo.b')}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="border-2 border-dashed border-soft-300 rounded-2xl p-5 text-center cursor-pointer hover:border-accent-400 hover:bg-accent-50/40 transition-colors">
                        <input type="file" accept=".zip,application/zip" className="hidden" onChange={escolherZipDeFotos} />
                        <LucideIcon name="file-archive" size={26} className="text-slate-400 mx-auto mb-2" />
                        <p className="font-bold text-navy-500 text-sm">{t('cfg.foto.zip')}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{t('cfg.foto.zip.sub')}</p>
                    </label>
                    <label className="border-2 border-dashed border-soft-300 rounded-2xl p-5 text-center cursor-pointer hover:border-accent-400 hover:bg-accent-50/40 transition-colors">
                        {/* webkitdirectory: escolher a PASTA inteira. O caminho
                            relativo vem junto e o backend corta — a matrícula
                            está no nome do arquivo, nunca na pasta. */}
                        <input type="file" accept="image/*" multiple webkitdirectory=""
                            className="hidden" onChange={escolherFotos} />
                        <LucideIcon name="folder-open" size={26} className="text-slate-400 mx-auto mb-2" />
                        <p className="font-bold text-navy-500 text-sm">{t('cfg.foto.pasta')}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{t('cfg.foto.pasta.sub')}</p>
                    </label>
                </div>

                {escolhidos > 0 && (
                    <div className="flex flex-wrap items-center gap-2 bg-white border border-soft-200 rounded-2xl p-3">
                        <span className="text-sm text-navy-500 font-semibold flex-1 min-w-[180px]">
                            {fotoZip ? fotoZip.name : t('cfg.foto.selecionados', { n: fotoArquivos.length })}
                        </span>
                        <button onClick={() => rodarImportacaoDeFotos(false)} disabled={fotoBusy}
                            className="px-4 py-2 rounded-xl bg-navy-500 text-white text-sm font-bold hover:bg-navy-600 disabled:opacity-50">
                            {fotoBusy ? t('cfg.verificando') : t('cfg.simular')}
                        </button>
                        {/* Só depois da simulação: confirmar sem ter visto o
                            plano é exatamente o que a disciplina existe para
                            impedir. */}
                        <button onClick={() => rodarImportacaoDeFotos(true)}
                            disabled={fotoBusy || !fotoPlan || fotoPlan.aplicado}
                            className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed">
                            {t('cfg.confirmar.gravar')}
                        </button>
                        <button onClick={limparEscolhaDeFotos} disabled={fotoBusy}
                            className="px-3 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200">
                            {t('admin.filtros.limpar')}
                        </button>
                    </div>
                )}

                {fotoPlan && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(FOTO_ACAO_LABEL).map(([chave, info]) => (
                                <span key={chave} className={`px-3 py-1 rounded-full text-xs font-bold ${info.cor}`}>
                                    {info.label}: {tot[chave] || 0}
                                </span>
                            ))}
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-navy-500/10 text-navy-500">
                                {t('agregados.total')} {tot.TOTAL || 0}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${fotoPlan.aplicado ? 'bg-success-100 text-success-700' : 'bg-amber-100 text-amber-700'}`}>
                                {fotoPlan.aplicado ? t('cfg.foto.gravado') : t('cfg.foto.simulado')}
                            </span>
                        </div>

                        <ListaLimitada
                            titulo={t('cfg.foto.arquivos', { n: fotoPlan.linhas.length })}
                            total={fotoPlan.linhas.length}
                            alturaMax="max-h-[46vh]"
                        >
                            {(visiveis) => (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white shadow-sm">
                                        <tr className="text-left text-slate-400 uppercase font-bold">
                                            <th className="py-2 px-2">{t('cfg.col.arquivo')}</th>
                                            <th className="py-2 px-2">{t('journal.filtro.acao')}</th>
                                            <th className="py-2 px-2">{t('journal.filtro.pessoa')}</th>
                                            <th className="py-2 px-2">{t('cfg.col.casou.por')}</th>
                                            <th className="py-2 px-2">{t('cfg.col.detalhe')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fotoPlan.linhas.slice(0, visiveis).map(l => {
                                            const info = FOTO_ACAO_LABEL[l.acao] || { label: l.acao, cor: 'bg-soft-100 text-slate-600' };
                                            return (
                                                <tr key={l.linha} className="border-t border-soft-100">
                                                    <td className="py-1.5 px-2 font-mono text-slate-500">{l.nomeArquivo}</td>
                                                    <td className="py-1.5 px-2">
                                                        <span className={`px-2 py-0.5 rounded-full font-bold ${info.cor}`}>{info.label}</span>
                                                    </td>
                                                    <td className="py-1.5 px-2 text-navy-500 font-semibold">
                                                        {l.nome || '—'}{l.userId && <span className="ml-1 font-mono text-slate-400">({l.userId})</span>}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-slate-500">{l.casouPor || '—'}</td>
                                                    <td className="py-1.5 px-2 text-slate-500">{l.detalhe || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </ListaLimitada>
                    </div>
                )}
            </div>
        );
    };

    const renderStaffList = () => (
        <div className="space-y-4 animate-fade-in">
            <div className="bg-soft-50 p-4 rounded-2xl border border-soft-200">
                <h3 className="text-lg font-bold text-navy-500 mb-1">{t('cfg.srv.titulo')}</h3>
                <p className="text-xs text-slate-500">
                    {t('cfg.srv.explica.a')} <strong>{t('cfg.srv.explica.b')}</strong> {t('cfg.srv.explica.c')}
                    <strong> {t('plano.acao.conferir')}</strong>{t('cfg.srv.explica.d')}
                </p>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    placeholder={t('cfg.srv.busca')}
                    className="flex-1 bg-soft-50 border border-soft-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    value={staffQuery}
                    onChange={e => setStaffQuery(e.target.value)}
                />
                <button onClick={carregarServidores}
                    className="px-3 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200">
                    {staffLoading ? '...' : t('acao.atualizar')}
                </button>
            </div>

            <ListaLimitada
                titulo={t('cfg.srv.contagem', { n: servidoresFiltrados.length })}
                total={servidoresFiltrados.length}
                alturaMax="max-h-[52vh]"
            >
                {(visiveis) => (
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white shadow-sm">
                            <tr className="text-left text-slate-400 uppercase font-bold">
                                <th className="py-2 px-2">{t('cfg.col.matricula')}</th>
                                <th className="py-2 px-2">{t('comum.nome')}</th>
                                <th className="py-2 px-2">{t('comum.tipo')}</th>
                                <th className="py-2 px-2">{t('cfg.col.departamento')}</th>
                                <th className="py-2 px-2">{t('cfg.col.posto')}</th>
                                <th className="py-2 px-2">ID Hikvision</th>
                                <th className="py-2 px-2">{t('cfg.col.passagens')}</th>
                                <th className="py-2 px-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {servidoresFiltrados.slice(0, visiveis).map(r => (
                                <tr key={r.id} className={`border-t border-soft-100 ${r.ativo ? '' : 'opacity-50'}`}>
                                    <td className="py-1.5 px-2 font-mono text-slate-500">{r.id}</td>
                                    <td className="py-1.5 px-2 font-bold text-navy-500">
                                        {r.nome}{!r.ativo && <span className="ml-1 text-[10px] text-slate-400">({t('cfg.inativo')})</span>}
                                    </td>
                                    <td className="py-1.5 px-2 text-slate-600">{r.tipo}</td>
                                    <td className="py-1.5 px-2 text-slate-600">{r.departamento || '—'}</td>
                                    <td className="py-1.5 px-2 text-slate-600">
                                        {r.postoFixoPointId
                                            ? <span title={t('cfg.srv.posto.title')}
                                                    className="font-semibold text-navy-500">
                                                  {window.MagboPostoFixo.rotuloDoPonto(r.postoFixoPointId)}
                                              </span>
                                            : '—'}
                                    </td>
                                    <td className="py-1.5 px-2 font-mono text-slate-500">{r.hikvisionEmployeeId || '—'}</td>
                                    <td className="py-1.5 px-2 tabular-nums text-slate-500">{r.passagens}</td>
                                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                                        <button onClick={() => setStaffEdit({
                                            id: r.id, nome: r.nome, tipo: r.tipo,
                                            departamento: r.departamento || '',
                                            // Já gravado vence; sem nada, o departamento
                                            // SUGERE (e só sugere — ver js/utils/postoFixo.js).
                                            postoFixoPointId: window.MagboPostoFixo.sugerir(r),
                                            postoFixoOriginal: r.postoFixoPointId || ''
                                        })}
                                            className="px-2 py-1 rounded bg-soft-100 text-navy-500 font-bold hover:bg-soft-200">
                                            {t('acao.editar')}
                                        </button>
                                        {/* Só em registro ATIVO: reclassificar um
                                            já inativo não muda nada. */}
                                        {r.ativo && (
                                            <button onClick={() => abrirReclass(r)}
                                                title={t('cfg.srv.eh.aluno.title')}
                                                className="ml-1 px-2 py-1 rounded bg-accent-100 text-accent-700 font-bold hover:bg-accent-200">
                                                {t('cfg.srv.eh.aluno')}
                                            </button>
                                        )}
                                        {r.ativo ? (
                                            <button onClick={() => acaoServidor(r, 'deactivate')}
                                                className="ml-1 px-2 py-1 rounded bg-amber-100 text-amber-800 font-bold hover:bg-amber-200">
                                                {t('cfg.srv.inativar')}
                                            </button>
                                        ) : (
                                            <button onClick={() => acaoServidor(r, 'reactivate')}
                                                className="ml-1 px-2 py-1 rounded bg-success-100 text-success-700 font-bold hover:bg-success-200">
                                                {t('cfg.srv.reativar')}
                                            </button>
                                        )}
                                        {/* Só aparece quando é seguro: com histórico,
                                            apagar deixaria as passagens órfãs. */}
                                        {r.podeRemover && (
                                            <button onClick={() => acaoServidor(r, 'delete')}
                                                className="ml-1 px-2 py-1 rounded bg-danger-100 text-danger-700 font-bold hover:bg-danger-200">
                                                {t('cfg.srv.remover')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListaLimitada>

            {renderReclass()}

            {staffEdit && (
                <div className="border border-accent-200 bg-accent-50 rounded-2xl p-4 space-y-3">
                    <p className="font-bold text-navy-500 text-sm">{t('acao.editar')} {staffEdit.nome} ({staffEdit.id})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('comum.tipo')}</label>
                            <select value={staffEdit.tipo}
                                onChange={e => setStaffEdit({ ...staffEdit, tipo: e.target.value })}
                                className="w-full bg-white border border-soft-200 rounded-xl px-3 py-2 text-sm">
                                <option value="FUNCIONARIO">{t('enum.tipo.FUNCIONARIO')}</option>
                                <option value="PROFESSOR">{t('enum.tipo.PROFESSOR')}</option>
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1">
                                {t('cfg.srv.aluno.nao.opcao')}
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.col.departamento')}</label>
                            <input type="text" list="magbo-departamentos" value={staffEdit.departamento}
                                onChange={e => setStaffEdit({ ...staffEdit, departamento: e.target.value })}
                                className="w-full bg-white border border-soft-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                    </div>

                    {/* ── Posto fixo ───────────────────────────────────────
                        Quem TRABALHA num ponto passa por ele o dia inteiro. A
                        primeira passagem do dia conta normalmente; as seguintes
                        continuam gravadas, mas saem das telas padrão e dos
                        contadores. Aluno nunca chega aqui — esta tela só lista
                        professores e funcionários, e o backend recusa o resto. */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                            {t('cfg.srv.posto.rotulo')}
                        </label>
                        <select
                            value={staffEdit.postoFixoPointId || ''}
                            onChange={e => setStaffEdit({ ...staffEdit, postoFixoPointId: e.target.value })}
                            className="w-full bg-white border border-soft-200 rounded-xl px-3 py-2 text-sm"
                        >
                            <option value="">{t('cfg.srv.posto.nenhum')}</option>
                            {window.MagboPostoFixo.PONTOS.map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">
                            {window.MagboPostoFixo.ehSugestao(
                                { departamento: staffEdit.departamento, postoFixoPointId: staffEdit.postoFixoOriginal },
                                staffEdit.postoFixoPointId)
                                ? <span className="text-amber-600 font-semibold">
                                      {t('cfg.srv.posto.sugerido')}
                                  </span>
                                : t('cfg.srv.posto.explica')}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={salvarServidor}
                            className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600">
                            {t('acao.salvar')}
                        </button>
                        <button onClick={() => setStaffEdit(null)}
                            className="px-4 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200">
                            {t('acao.cancelar')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    // ── Casamento manual: face do HCP -> aluno certo ─────────────────────

    const abrirCasamento = (row) => {
        setMatchRow(row);
        // Pré-preenche com o nome do HCP: é o único elo com o cadastro.
        setMatchQuery(row.nome || '');
        setMatchResults([]);
        setMatchChoice(null);
        setMatchPreview(null);
    };

    React.useEffect(() => {
        if (!matchRow) return;
        const q = matchQuery.trim();
        if (q.length < 2) { setMatchResults([]); return; }
        let vivo = true;
        const tid = setTimeout(async () => {
            try {
                const achados = await window.userCache.search(q, 20);
                if (vivo) setMatchResults((achados || []).filter(u => u.tipo === 'ALUNO'));
            } catch (e) { if (vivo) setMatchResults([]); }
        }, 250);
        return () => { vivo = false; clearTimeout(tid); };
    }, [matchQuery, matchRow]);

    const escolherAluno = async (aluno) => {
        setMatchChoice(aluno);
        setMatchPreview(null);
        try {
            const r = await window.api.previewStudentMatch(aluno.id, matchRow.idHikvision);
            setMatchPreview(r.preview);
        } catch (e) {
            onShowToast({ title: t('cfg.match.erro.conferir'), message: e.message, type: 'error' });
        }
    };

    const confirmarCasamento = async () => {
        if (!matchChoice || !matchRow || matchSaving) return;
        setMatchSaving(true);
        try {
            const r = await window.api.confirmStudentMatch(matchChoice.id, matchRow.idHikvision);
            setMatchDone(prev => ({ ...prev, [matchRow.idHikvision]: matchChoice.id }));
            onShowToast({ title: t('cfg.match.ok'), message: r.message, type: 'success' });
            if (window.userCache?.reload) await window.userCache.reload();
            setMatchRow(null);
        } catch (e) {
            onShowToast({ title: t('cfg.match.nao.realizado'), message: e.message, type: 'error' });
        } finally {
            setMatchSaving(false);
        }
    };

    const renderCasamento = () => {
        if (!matchRow) return null;
        return (
            <div className="border-2 border-amber-300 bg-white rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="font-bold text-navy-500 text-sm">{t('plano.acao.conferir')}: {matchRow.nome}</p>
                        <p className="text-[11px] text-slate-500">
                            {t('cfg.match.id.hcp')} <span className="font-mono">{matchRow.idHikvision}</span> ·
                            {' '}{t('cfg.match.linha.a')} {matchRow.linha} {t('cfg.match.linha.b')}
                        </p>
                    </div>
                    <button onClick={() => setMatchRow(null)}
                        className="text-xs font-bold text-slate-500 underline hover:no-underline">{t('acao.fechar')}</button>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.match.procurar')}</label>
                    <input type="text" value={matchQuery} onChange={e => setMatchQuery(e.target.value)}
                        className="w-full bg-soft-50 border border-soft-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
                </div>

                {matchResults.length > 0 && !matchChoice && (
                    <div className="max-h-40 overflow-y-auto border border-soft-200 rounded-xl">
                        {matchResults.map(a => (
                            <button key={a.id} onClick={() => escolherAluno(a)}
                                className="w-full text-left px-3 py-2 text-xs border-b border-soft-100 last:border-0 hover:bg-accent-50">
                                <span className="font-bold text-navy-500">{a.nome}</span>
                                <span className="text-slate-400 ml-2 font-mono">{a.id}</span>
                                <span className="text-slate-400 ml-2">{a.turma || '—'}</span>
                                {a.hikvision_employee_id && (
                                    <span className="ml-2 text-amber-700">{t('cfg.ja.tem.face')} {a.hikvision_employee_id}</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Os dois lados, lado a lado, ANTES de gravar: é uma face
                    trocando de dono, e o erro aqui é dar a face de um aluno a
                    outro. */}
                {matchPreview && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="border border-success-200 bg-success-50 rounded-xl p-3">
                            <p className="text-[11px] font-bold text-success-700 uppercase mb-1">{t('cfg.match.recebe')}</p>
                            <p className="font-bold text-navy-500 text-sm">{matchPreview.alunoNome}</p>
                            <p className="text-[11px] text-slate-600 font-mono">{matchPreview.alunoId}</p>
                            <p className="text-[11px] text-slate-600">{t('comum.turma')}: {matchPreview.alunoTurma || '—'}</p>
                            <p className="text-[11px] text-slate-600">
                                {t('cfg.match.id.atual')}: {matchPreview.alunoHikvisionAtual || t('cfg.nenhum')} →
                                <span className="font-mono font-bold"> {matchPreview.hikvisionId}</span>
                            </p>
                        </div>
                        <div className={`border rounded-xl p-3 ${matchPreview.servidorId ? 'border-danger-200 bg-danger-50' : 'border-soft-200 bg-soft-50'}`}>
                            <p className="text-[11px] font-bold text-danger-700 uppercase mb-1">
                                {matchPreview.servidorId ? t('cfg.match.inativado') : t('cfg.match.nada.desfazer')}
                            </p>
                            {matchPreview.servidorId ? (
                                <>
                                    <p className="font-bold text-navy-500 text-sm">{matchPreview.servidorNome}</p>
                                    <p className="text-[11px] text-slate-600 font-mono">{matchPreview.servidorId}</p>
                                    <p className="text-[11px] text-slate-600">{t('cfg.col.departamento')}: {matchPreview.servidorDepartamento || '—'}</p>
                                    <p className="text-[11px] text-slate-600">
                                        {t('cfg.passagens', { n: matchPreview.servidorPassagens })} — {t('cfg.match.preservadas')}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[11px] text-slate-500">
                                    {t('cfg.match.sem.servidor')}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {matchChoice && (
                    <div className="flex gap-2">
                        <button onClick={confirmarCasamento} disabled={matchSaving || !matchPreview}
                            className="px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 disabled:opacity-50">
                            {matchSaving ? t('comum.gravando') : t('cfg.match.confirmar')}
                        </button>
                        <button onClick={() => { setMatchChoice(null); setMatchPreview(null); }}
                            className="px-4 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200">
                            {t('cfg.escolher.outro')}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const renderHikCentralImport = () => {
        // Quais listas aparecem, o que o título promete e se dá para confirmar:
        // tudo em js/utils/importPlan.js, com teste. Esta é a tela que
        // transfere FACES entre pessoas — o painel mostrar a coisa errada aqui
        // custa uma face no dono errado.
        const plano = window.MagboImportPlan.planState(hikPlan);
        const totais = plano.totais;
        const revisao = plano.revisao;
        const problemas = plano.problemas;

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                    <h3 className="text-lg font-bold text-navy-500 mb-2">{t('cfg.hik.titulo')}</h3>
                    <div className="text-sm text-slate-500 mb-4">
                        {t('cfg.hik.instrucao.a')} <strong>Renseignements personnels</strong> {t('cfg.hik.instrucao.b')}
                        <ImportColumnList doc={window.MagboImportColumns.HIKCENTRAL} />
                    </div>
                    <ul className="text-xs text-slate-500 space-y-1 mb-6 list-disc pl-5">
                        <li><strong>{t('cfg.hik.li1.a')}</strong> {t('cfg.hik.li1.b')}</li>
                        <li><strong>{t('cfg.hik.li2.a')}</strong> {t('cfg.hik.li2.b')}</li>
                        <li>{t('cfg.hik.li3')}</li>
                    </ul>

                    <div className="border-2 border-dashed border-accent-200 rounded-2xl p-8 text-center bg-white hover:bg-accent-50 transition-colors relative group">
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleHikCentralFile}
                        />
                        <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4 text-accent-600 group-hover:scale-110 transition-transform">
                            <LucideIcon name="scan-face" size={32} />
                        </div>
                        <p className="font-bold text-navy-500">{t('cfg.hik.arraste')}</p>
                        <p className="text-sm text-slate-400 mt-1">{hikRows.length > 0 ? t('cfg.hik.linhas.carregadas', { n: hikRows.length }) : t('cfg.formatos.curto')}</p>
                    </div>
                </div>

                {/* Caminho INVERSO: o MAGBO diz ao HCP quem falta cadastrar. */}
                <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                    <h3 className="text-lg font-bold text-navy-500 mb-2">{t('cfg.csv.titulo')}</h3>
                    <p className="text-sm text-slate-500 mb-4">
                        {t('cfg.csv.explica.a')} (<em>Apply to Device</em>). {t('cfg.csv.explica.b')}
                        {' '}<strong>{t('cfg.csv.explica.c')}</strong> — {t('cfg.csv.explica.d')}
                    </p>
                    <p className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-xl px-3 py-2 mb-4">
                        ⚠️ <strong>{t('cfg.csv.excel.a')}</strong> {t('cfg.csv.excel.b')}
                        <span className="font-mono"> 0001764</span> {t('cfg.csv.excel.c')}
                        <span className="font-mono"> 1764</span>{t('cfg.csv.excel.d')}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            onClick={() => exportarCsvHikCentral('missing-face')}
                            disabled={exportando}
                            className="flex-1 px-4 py-3 rounded-xl bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 transition-colors disabled:opacity-50"
                        >
                            {exportando ? t('cfg.gerando') : t('cfg.csv.baixar.faltantes')}
                        </button>
                        <button
                            type="button"
                            onClick={() => exportarCsvHikCentral('all')}
                            disabled={exportando}
                            className="px-4 py-3 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold hover:bg-soft-200 transition-colors disabled:opacity-50"
                        >
                            {t('cfg.csv.todos')}
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                        {t('cfg.csv.pendencia')}
                    </p>
                </div>

                {hikPlan && (
                    <div className="bg-white border border-soft-200 rounded-2xl p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="font-bold text-navy-500 text-sm">{t(plano.titulo)}</p>
                            <span className="text-xs text-slate-400">{t('cfg.hik.linhas', { n: plano.total })}</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                            {Object.keys(ACOES_HIK).map(k => (
                                <div key={k} className="rounded-xl border border-soft-200 p-3 text-center">
                                    <p className="text-xl font-bold text-navy-500 tabular-nums">{totais[k] || 0}</p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{ACOES_HIK[k].label}</p>
                                </div>
                            ))}
                        </div>

                        {/* O botão de confirmar mora na barra de ação fixa, no
                            rodapé — daqui ele seria empurrado para fora da tela
                            pelas listas abaixo, que é o defeito que se corrige. */}

                        {revisao.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <p className="text-[11px] text-amber-700 mb-2">
                                    {t('cfg.hik.revisao.explica')}
                                </p>
                                <ListaLimitada
                                    titulo={t('cfg.hik.revisao.contagem', { n: revisao.length })}
                                    total={revisao.length}
                                    alturaMax="max-h-[30vh]"
                                    classeTitulo="text-amber-800"
                                >
                                    {(visiveis) => (
                                        <table className="w-full text-xs">
                                            <tbody>
                                                {/* key pelo idHikvision e não pelo índice: as linhas
                                                    ganham estado (casada/não) e índice desalinharia. */}
                                                {revisao.slice(0, visiveis).map((r) => {
                                                    const casadaCom = matchDone[r.idHikvision];
                                                    return (
                                                        <tr key={r.idHikvision} className="border-b border-amber-100 last:border-0">
                                                            <td className="py-1 px-2 font-mono text-amber-800">L{r.linha}</td>
                                                            <td className="py-1 px-2 font-bold text-navy-500">{r.nome}</td>
                                                            <td className="py-1 px-2 font-mono text-slate-600">{r.idHikvision}</td>
                                                            <td className="py-1 px-2 text-right">
                                                                {casadaCom ? (
                                                                    <span className="text-success-700 font-bold">✓ {casadaCom}</span>
                                                                ) : (
                                                                    <button onClick={() => abrirCasamento(r)}
                                                                        className="px-2 py-1 rounded bg-amber-200 text-amber-900 font-bold hover:bg-amber-300">
                                                                        {t('plano.acao.conferir')}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </ListaLimitada>
                                {renderCasamento()}
                            </div>
                        )}

                        {problemas.length > 0 && (
                            <ListaLimitada
                                titulo={t('cfg.hik.problemas.contagem', { n: problemas.length })}
                                total={problemas.length}
                            >
                                {(visiveis) => (
                                    <table className="w-full text-xs">
                                        <tbody>
                                            {problemas.slice(0, visiveis).map((l, i) => (
                                                <tr key={i} className="border-b border-soft-100 last:border-0 align-top">
                                                    <td className="py-1 px-2 font-mono text-slate-400 whitespace-nowrap">L{l.linha}</td>
                                                    <td className="py-1 px-2 whitespace-nowrap">
                                                        <span className={`px-1.5 py-0.5 rounded font-bold ${ACOES_HIK[l.acao].cor}`}>
                                                            {ACOES_HIK[l.acao].label}
                                                        </span>
                                                    </td>
                                                    <td className="py-1 px-2 text-navy-500">{l.nome}</td>
                                                    <td className="py-1 px-2 text-slate-600">{l.detalhe}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </ListaLimitada>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderStaffImport = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                <h3 className="text-lg font-bold text-navy-500 mb-2">{t('cfg.simp.titulo')}</h3>
                <div className="text-sm text-slate-500 mb-6">
                    {t('cfg.simp.instrucao.a')} <strong>.xlsx</strong> {t('cfg.imp.instrucao.b')}
                    <ImportColumnList doc={window.MagboImportColumns.SERVIDORES} />
                    <p className="text-xs text-slate-400 mt-2">
                        {t('cfg.simp.alunos.nao')}
                    </p>
                </div>

                <div className="border-2 border-dashed border-accent-200 rounded-2xl p-8 text-center bg-white hover:bg-accent-50 transition-colors relative group">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleStaffFileUpload}
                    />
                    <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4 text-accent-600 group-hover:scale-110 transition-transform">
                        <LucideIcon name="users" size={32} />
                    </div>
                    <p className="font-bold text-navy-500">{t('cfg.simp.arraste')}</p>
                    <p className="text-sm text-slate-400 mt-1">{t('cfg.formatos')}</p>
                </div>
            </div>

            {staffImportErrors.length > 0 && (
                <div className="bg-danger-50 border border-danger-200 rounded-2xl p-4">
                    <div className="flex items-center justify-end mb-2">
                        <button
                            onClick={() => setStaffImportErrors([])}
                            className="text-xs font-bold text-danger-700 underline hover:no-underline"
                        >
                            {t('acao.fechar')}
                        </button>
                    </div>
                    <ListaLimitada
                        titulo={t('cfg.simp.recusadas', { n: staffImportErrors.length })}
                        total={staffImportErrors.length}
                        classeTitulo="text-danger-700"
                    >
                        {(visiveis) => (
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white">
                                    <tr className="text-left text-danger-700/70 uppercase font-bold">
                                        <th className="py-1 px-2">{t('cfg.col.linha')}</th>
                                        <th className="py-1 px-2">{t('comum.nome')}</th>
                                        <th className="py-1 px-2">{t('cfg.col.motivo')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staffImportErrors.slice(0, visiveis).map((e, i) => (
                                        <tr key={i} className="border-t border-danger-100 align-top">
                                            <td className="py-1 px-2 font-mono text-danger-700">{e.linha}</td>
                                            <td className="py-1 px-2 text-navy-500">{e.nome}</td>
                                            <td className="py-1 px-2 text-slate-600">{e.erro}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </ListaLimitada>
                </div>
            )}
        </div>
    );

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);

        try {
            if (ehServidor) {
                // Caminho dos SERVIDORES. Matrícula em branco = o backend emite
                // a próxima FUNC-###; app_users.id é NOT NULL e era exatamente
                // isso que fazia o formulário antigo não gravar nada.
                const resultado = await window.api.createStaff({
                    matricula: manualForm.matricula.trim(),
                    nome: manualForm.nome.trim(),
                    hikvisionEmployeeId: manualForm.hikvision_employee_id.trim(),
                    tipo: manualForm.tipo,
                    departamento: manualForm.departamento.trim()
                });

                if (window.userCache?.reload) await window.userCache.reload();

                // A confirmação diz a matrícula EMITIDA: é o número que o
                // operador precisa levar para o HikCentral.
                onShowToast({
                    title: t('cfg.man.srv.ok'),
                    message: t('cfg.man.srv.detalhe', { nome: resultado.nome, matricula: resultado.matricula })
                        + (resultado.hikvisionEmployeeId
                            ? ` · ID Hikvision ${resultado.hikvisionEmployeeId}`
                            : t('cfg.man.srv.sem.id')),
                    type: resultado.hikvisionEmployeeId ? 'success' : 'warning'
                });
                limparFormulario(manualForm.tipo);
                setProximaMatricula(await window.api.fetchNextStaffMatricula().catch(() => ''));
                return;
            }

            // Caminho ANTIGO, intocado: aluno e responsável.
            const payload = {
                id: `USR${Date.now()}`,
                nome: manualForm.nome,
                tipo: manualForm.tipo,
                turma: manualForm.turma,
                horarioSaida: manualForm.horario_saida,
                // F7c: sem fotoUrl — o data-URI do localAvatar não cabe em foto_url varchar(255);
                // a exibição usa o fallback local (normaliseUser/handleImgError) com o mesmo visual.
            };
            if (manualForm.tipo === 'RESPONSAVEL') {
                payload.telefone = manualForm.telefone;
                payload.parentesco = manualForm.parentesco;
            } else if (manualForm.tipo === 'ALUNO') {
                payload.responsavelId = manualForm.responsavel_id;
            }

            const resposta = await window.api.createUser(payload);
            // O backend pode responder 200 com status=error; sem esta checagem
            // a tela dizia "sucesso" para uma recusa.
            if (resposta && resposta.status === 'error') {
                throw new Error(resposta.message || t('cfg.man.falha'));
            }

            if (window.userCache?.reload) await window.userCache.reload();
            onShowToast({ title: t('cfg.man.ok'), message: t('cfg.man.ok.detalhe', { nome: manualForm.nome }), type: 'success' });
            limparFormulario('ALUNO');
        } catch (error) {
            console.error(error);
            onShowToast({
                title: t('cfg.man.nao.realizado'),
                message: error.message || t('cfg.man.falha'),
                type: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * Importação da planilha de SERVIDORES. Reaproveita o mesmo caminho de
     * leitura do xlsx do import de alunos, com colunas e endpoint próprios.
     *
     * ⚠️ Tudo lido como TEXTO (raw:false / String(...)): matrícula e
     * identificador Hikvision têm zeros à esquerda, e o xlsx tende a convertê-los
     * em número, comendo o zero — o mesmo cuidado da importação de entitlements.
     */
    const handleStaffFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const workbook = window.XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames.includes('Servidores')
                    ? 'Servidores'
                    : workbook.SheetNames[0];
                const json = window.XLSX.utils.sheet_to_json(
                    workbook.Sheets[sheetName], { defval: '', raw: false });

                const col = (row, ...nomes) => {
                    for (const n of nomes) {
                        if (row[n] !== undefined && String(row[n]).trim() !== '') {
                            return String(row[n]).trim();
                        }
                    }
                    return '';
                };

                const payload = json
                    .filter(row => col(row, 'nome', 'Nome', 'NOME') !== '')
                    .map(row => ({
                        nome: col(row, 'nome', 'Nome', 'NOME'),
                        hikvisionEmployeeId: col(row, 'hikvision_employee_id', 'Hikvision', 'hikvisionEmployeeId', 'ID Hikvision'),
                        tipo: col(row, 'tipo', 'Tipo', 'TIPO').toUpperCase(),
                        departamento: col(row, 'departamento', 'Departamento', 'Setor'),
                        matricula: col(row, 'matricula', 'Matricula', 'Matrícula')
                    }));

                if (payload.length === 0) {
                    onShowToast({
                        title: t('cfg.imp.vazia'),
                        message: t('cfg.simp.vazia.detalhe'),
                        type: 'error'
                    });
                    return;
                }

                onShowToast({
                    title: t('cfg.simp.enviando'),
                    message: t('cfg.enviando.n', { n: payload.length }), type: 'info'
                });

                const result = await window.api.createStaffBulk(payload);
                if (window.userCache?.reload) await window.userCache.reload();

                if (result.falhas === 0) {
                    onShowToast({
                        title: t('cfg.imp.ok'),
                        message: t('cfg.simp.ok.detalhe', { n: result.sucesso }),
                        type: 'success'
                    });
                } else {
                    // Erro POR LINHA na própria tela, não só no console: quem
                    // importa a planilha precisa saber qual linha corrigir.
                    setStaffImportErrors(result.detalheErros || []);
                    onShowToast({
                        title: t('cfg.imp.parcial', { ok: result.sucesso, total: result.totalRecebido }),
                        message: t('cfg.simp.parcial.detalhe', { n: result.falhas }),
                        type: 'warning'
                    });
                }
            } catch (err) {
                console.error('Erro na importação de servidores:', err);
                onShowToast({
                    title: t('cfg.erro'),
                    message: err.message || t('cfg.simp.falha.processar'),
                    type: 'error'
                });
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const renderManualRegistration = () => (
        <div className="animate-fade-in">
            {/* O botão de submeter vive na barra de ação, ligado por `form=`. */}
            <form id={FORM_CADASTRO_MANUAL} onSubmit={handleManualSubmit} className="space-y-4">
                {/* `sm:col-span-2` e não `col-span-2`: numa grade de UMA coluna,
                    um item que ocupa duas cria uma segunda coluna IMPLÍCITA
                    (dimensionada como `auto`), e os campos de span simples
                    ficam espremidos contra ela. O span só vale quando a grade
                    realmente tem duas colunas. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.man.nome')}</label>
                        <input
                            required
                            type="text"
                            className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                            value={manualForm.nome}
                            onChange={e => setManualForm({ ...manualForm, nome: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.man.tipo')}</label>
                        <select
                            className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                            value={manualForm.tipo}
                            onChange={e => setManualForm({ ...manualForm, tipo: e.target.value })}
                        >
                            <option value="ALUNO">{t('enum.tipo.ALUNO')}</option>
                            <option value="RESPONSAVEL">{t('enum.tipo.RESPONSAVEL')}</option>
                            <option value="PROFESSOR">{t('enum.tipo.PROFESSOR')}</option>
                            <option value="FUNCIONARIO">{t('enum.tipo.FUNCIONARIO')}</option>
                        </select>
                    </div>

                    {manualForm.tipo === 'ALUNO' && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('comum.turma')}</label>
                                <input
                                    type="text"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.turma}
                                    onChange={e => setManualForm({ ...manualForm, turma: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.man.horario')}</label>
                                <input
                                    type="time"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.horario_saida}
                                    onChange={e => setManualForm({ ...manualForm, horario_saida: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.man.resp.id')}</label>
                                <input
                                    type="text"
                                    placeholder={t('cfg.man.resp.exemplo')}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.responsavel_id}
                                    onChange={e => setManualForm({ ...manualForm, responsavel_id: e.target.value })}
                                />
                            </div>
                        </>
                    )}

                    {ehServidor && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.col.matricula')}</label>
                                <input
                                    type="text"
                                    placeholder={proximaMatricula ? t('cfg.man.automatico.n', { m: proximaMatricula }) : t('cfg.man.automatico')}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.matricula}
                                    onChange={e => setManualForm({ ...manualForm, matricula: e.target.value })}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    {t('cfg.man.matricula.ajuda')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    {t('cfg.man.id.hik')}
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={t('cfg.man.id.exemplo')}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.hikvision_employee_id}
                                    onChange={e => setManualForm({ ...manualForm, hikvision_employee_id: e.target.value })}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    {t('cfg.man.id.ajuda')}
                                </p>
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.col.departamento')}</label>
                                <input
                                    type="text"
                                    list="magbo-departamentos"
                                    placeholder={t('cfg.man.depto.exemplo')}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.departamento}
                                    onChange={e => setManualForm({ ...manualForm, departamento: e.target.value })}
                                />
                                <datalist id="magbo-departamentos">
                                    {DEPARTAMENTOS_SUGERIDOS.map(d => <option key={d} value={d} />)}
                                </datalist>
                            </div>
                        </>
                    )}

                    {manualForm.tipo === 'RESPONSAVEL' && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.man.parentesco')}</label>
                                <input
                                    type="text"
                                    placeholder={t('cfg.man.parentesco.exemplo')}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.parentesco}
                                    onChange={e => setManualForm({ ...manualForm, parentesco: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">{t('cfg.man.telefone')}</label>
                                <input
                                    type="text"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.telefone}
                                    onChange={e => setManualForm({ ...manualForm, telefone: e.target.value })}
                                />
                            </div>
                        </>
                    )}
                </div>
            </form>
        </div>
    );

    /**
     * Barra de ação da aba ativa. Fica FORA da área rolável, então o botão
     * principal está sempre visível — antes ele era a última coisa de uma
     * página que não rolava, ou seja, inalcançável.
     *
     * O botão do cadastro manual usa `form=`: ele submete o formulário sem
     * estar dentro dele, o que permite tirá-lo do fluxo rolável sem perder o
     * submit nativo (Enter no campo, validação de `required`).
     */
    const barraDeAcao = (() => {
        const planoBarra = window.MagboImportPlan.planState(hikPlan);
        if (activeTab === 'hikcentral' && planoBarra.podeConfirmar) {
            return (
                /* Empilha em tela estreita. Numa linha só, o rótulo longo
                   ("CONFIRMAR — 1197 criar, 996 atualizar") empurrava o botão
                   para fora do cartão, que é `overflow-hidden` — ou seja,
                   cortado de novo, exatamente o defeito em correção. */
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <p className="text-xs text-slate-500 sm:flex-1 sm:min-w-0">
                        {t('cfg.barra.simulada')}
                    </p>
                    <button
                        onClick={confirmarImportHikCentral}
                        disabled={hikApplying}
                        className="w-full sm:w-auto sm:max-w-[60%] px-6 py-3 bg-accent-500 text-white font-bold rounded-xl hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed truncate"
                    >
                        {hikApplying ? t('comum.gravando') : t(planoBarra.rotuloConfirmar, planoBarra.confirmarParams)}
                    </button>
                </div>
            );
        }
        if (activeTab === 'manual') {
            return (
                <button
                    type="submit"
                    form={FORM_CADASTRO_MANUAL}
                    disabled={submitting}
                    className="w-full py-3 bg-accent-500 text-white font-bold rounded-xl hover:bg-accent-600 transition-colors shadow-lg shadow-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting
                        ? t('cfg.man.cadastrando')
                        : (ehServidor ? t('cfg.man.btn.servidor') : t('cfg.man.btn.usuario'))}
                </button>
            );
        }
        return null;
    })();

    return (
        /*
         * TELA CHEIA, não um cartão centralizado.
         *
         * O que quebrou em produção: o cartão tinha `overflow-hidden` e nenhum
         * limite de altura, dentro de um flex `items-center`. Conteúdo mais
         * alto que a janela era CORTADO (overflow-hidden não rola), e a
         * centralização empurrava o cabeçalho — com o botão de fechar — para
         * fora da tela por cima. Não havia saída pelo mouse.
         *
         * A estrutura agora é uma coluna flex do tamanho do viewport:
         *   cabeçalho (shrink-0)  ·  corpo (flex-1 min-h-0)  ·  barra (shrink-0)
         *
         * `min-h-0` em TODO filho flex que precisa rolar é o que faz a coisa
         * funcionar: sem ele o filho tem min-height auto (= tamanho do
         * conteúdo), se recusa a encolher e transborda em vez de rolar. É
         * exatamente a peça que faltava aqui.
         */
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('cfg.titulo')}
            className="fixed inset-0 z-[200] bg-navy-900/60 backdrop-blur-sm flex flex-col p-0 sm:p-4"
        >
            <div className="bg-white sm:rounded-[24px] w-full max-w-[1600px] mx-auto shadow-2xl flex flex-col flex-1 min-h-0 overflow-hidden animate-zoom-in">

                {/* Header — shrink-0: nunca é espremido nem sai da tela */}
                <div className="shrink-0 bg-navy-500 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 bg-white/10 rounded-xl flex items-center justify-center">
                            <LucideIcon name="settings" size={20} className="text-white" />
                        </div>
                        <div className="min-w-0">
                            {/* ⚠️ Le titre suit le PROFIL : pour le porteur de
                                CONFIG_WRITE seul, « Paramètres et Registres /
                                importez des utilisateurs » promettait un import
                                qu'il ne verra jamais. L'interface n'affirme pas
                                plus qu'elle n'offre (réserve du panel, 28/08). */}
                            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{ehAdmin ? t('cfg.titulo') : t('cfg.aba.config')}</h2>
                            <p className="text-xs text-white/50 truncate">{ehAdmin ? t('cfg.subtitulo') : t('cfg.subtitulo.config')}</p>
                        </div>
                    </div>
                    <button
                        ref={fecharRef}
                        onClick={onClose}
                        title={t('cfg.fechar.esc')}
                        aria-label={t('acao.fechar')}
                        className="w-10 h-10 shrink-0 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60 transition-colors"
                    >
                        <LucideIcon name="x" size={20} />
                    </button>
                </div>

                {/* Corpo: navegação + conteúdo, cada um com a sua rolagem */}
                <div className="flex flex-1 min-h-0">
                    {/* Sidebar Tabs — rola sozinha se não couber */}
                    <div className="w-52 sm:w-60 lg:w-64 shrink-0 bg-slate-50 border-r border-soft-200 p-4 space-y-2 overflow-y-auto overscroll-contain">
                        {/* ⚠️ A configuração do SISTEMA — não do poste. É a única
                            aba visível a quem tem CONFIG_WRITE sem ser admin. */}
                        {podeConfig && (
                        <button
                            onClick={() => setActiveTab('config')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'config' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="sliders-horizontal" size={18} className={activeTab === 'config' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.config')}
                        </button>
                        )}
                        {/* ⚠️ LE POSTE — l'adresse du serveur et le lieu de CE PC.
                            Distinct de la « configuration du système » juste
                            au-dessus : celle-là gouverne l'école entière et vit
                            en base ; celui-ci ne concerne que cet ordinateur et
                            vit dans un fichier à côté du .exe (ADR-007).

                            ⚠️ DERRIÈRE CONFIG_WRITE, comme demandé : un opérateur
                            ne doit pas pouvoir changer le poste par mégarde — il
                            ouvrirait l'écran d'un autre lieu sans comprendre ce
                            qu'il a fait. Un administrateur, lui, corrige une
                            erreur d'installation sans réinstaller.

                            ⚠️ Ce bouton FERME le modal et laisse App.js rendre
                            l'écran : le même composant sert la première
                            configuration et la correction. Deux copies auraient
                            divergé au premier changement de libellé. */}
                        {podeConfig && (
                        <button
                            onClick={() => { onClose(); window.dispatchEvent(new Event('open-poste-config')); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left text-slate-600 hover:bg-white"
                        >
                            <LucideIcon name="monitor-cog" size={18} className="text-slate-400" />
                            {t('poste.onglet')}
                        </button>
                        )}
                        {ehAdmin && (<>
                        <button
                            onClick={() => setActiveTab('import')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'import' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="file-spreadsheet" size={18} className={activeTab === 'import' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.excel')}
                        </button>
                        <button
                            onClick={() => setActiveTab('hikcentral')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'hikcentral' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="scan-face" size={18} className={activeTab === 'hikcentral' ? 'text-accent-500' : 'text-slate-400'} />
                            HikCentral
                        </button>
                        <button
                            onClick={() => setActiveTab('staff-list')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'staff-list' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="id-card" size={18} className={activeTab === 'staff-list' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.servidores')}
                        </button>
                        <button
                            onClick={() => setActiveTab('staff-import')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'staff-import' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="users" size={18} className={activeTab === 'staff-import' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.imp.servidores')}
                        </button>
                        <button
                            onClick={() => setActiveTab('photos')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'photos' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="image" size={18} className={activeTab === 'photos' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.fotos')}
                        </button>
                        <button
                            onClick={() => setActiveTab('manual')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'manual' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="user-plus" size={18} className={activeTab === 'manual' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.manual')}
                        </button>
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'general' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="cog" size={18} className={activeTab === 'general' ? 'text-accent-500' : 'text-slate-400'} />
                            {t('cfg.aba.gerais')}
                        </button>
                        </>)}
                    </div>

                    {/* Coluna do conteúdo: área rolável + barra de ação fixa */}
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white">
                        <div ref={conteudoRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
                            {/* ⚠️ `ehAdmin` também no CONTEÚDO, não só na sidebar:
                                esconder o botão sem gardar o conteúdo deixaria as
                                abas de administração a um setActiveTab de distância
                                no console. A garde real é a do servidor; esta
                                impede o ecrã de mentir sobre o que oferece. */}
                            {activeTab === 'config' && podeConfig && <SystemConfiguration />}
                            {ehAdmin && activeTab === 'import' && renderImportSettings()}
                            {ehAdmin && activeTab === 'hikcentral' && renderHikCentralImport()}
                            {ehAdmin && activeTab === 'staff-list' && renderStaffList()}
                            {ehAdmin && activeTab === 'staff-import' && renderStaffImport()}
                            {ehAdmin && activeTab === 'photos' && renderPhotoImport()}
                            {ehAdmin && activeTab === 'manual' && renderManualRegistration()}
                            {ehAdmin && activeTab === 'general' && renderGeneralSettings()}
                        </div>

                        {/*
                         * Barra de ação: IRMÃ da área rolável, não filha.
                         * `position: sticky` dentro do scroll ainda pode ser
                         * empurrada por conteúdo largo ou por um contêiner que
                         * cresce; como linha própria do flex com shrink-0, o
                         * botão de confirmar simplesmente não tem como sair da
                         * tela — que é o requisito.
                         */}
                        {barraDeAcao && (
                            <div className="shrink-0 border-t border-soft-200 bg-white px-4 sm:px-6 py-3">
                                {barraDeAcao}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
