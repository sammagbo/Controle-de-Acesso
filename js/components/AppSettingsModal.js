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
    'Biblioteca / CDI'
];

/** Tipos que são servidor da escola — o resto segue o fluxo antigo. */
const TIPOS_DE_SERVIDOR = ['PROFESSOR', 'FUNCIONARIO'];

function AppSettingsModal({ onClose, onShowToast }) {
    const [activeTab, setActiveTab] = React.useState('import'); // 'general', 'import', 'staff-import', 'manual'

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
                onShowToast({ title: 'Erro', message: 'Não foi possível ativar a tela cheia.', type: 'error' });
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
                <h3 className="text-lg font-bold text-navy-500 mb-2">Configurações Gerais</h3>
                <p className="text-sm text-slate-500 mb-6">Ajustes básicos do sistema (Em desenvolvimento).</p>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-soft-200">
                        <div>
                            <p className="font-bold text-navy-500">Modo Tela Cheia</p>
                            <p className="text-xs text-slate-400">Ativar exibição em tela cheia na portaria</p>
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
                    onShowToast({ title: 'Planilha vazia', message: 'Nenhuma linha válida encontrada (verifique a coluna Nome).', type: 'error' });
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

                onShowToast({ title: 'Importando...', message: `Enviando ${payload.length} registros ao servidor.`, type: 'info' });

                const result = await window.api.createUsersBulk(payload);

                // Recarrega cache para refletir no UI
                if (window.userCache && window.userCache.reload) {
                    await window.userCache.reload();
                }

                // Feedback detalhado
                if (result.status === 'success') {
                    onShowToast({
                        title: 'Importação concluída',
                        message: `${result.sucesso} usuários importados com sucesso.`,
                        type: 'success'
                    });
                } else {
                    const detalhes = (result.detalheErros || [])
                        .slice(0, 5)
                        .map(e => `Linha ${e.linha} (${e.nome}): ${e.erro}`)
                        .join('\n');
                    console.warn('Erros na importação:', result.detalheErros);
                    onShowToast({
                        title: `Importação parcial: ${result.sucesso}/${result.totalRecebido}`,
                        message: `${result.falhas} falharam. Veja console (F12) para detalhes.`,
                        type: 'warning'
                    });
                }
            } catch (err) {
                console.error('Erro na importação:', err);
                onShowToast({
                    title: 'Erro',
                    message: err.message || 'Falha ao processar arquivo Excel.',
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
                <h3 className="text-lg font-bold text-navy-500 mb-2">Importar Cadastro via Excel</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Envie planilha <strong>.xlsx</strong> com as colunas:
                    <br/>
                    <code className="text-xs bg-soft-100 px-2 py-1 rounded">ID, Nome, Tipo, Turma, ResponsavelId, Parentesco, Telefone, Foto</code>
                    <br/>
                    <span className="text-xs">Use o template oficial. Tipos aceitos: ALUNO, PROFESSOR, FUNCIONARIO, RESPONSAVEL (sempre maiúsculas).</span>
                </p>

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
                    <p className="font-bold text-navy-500">Clique ou arraste o arquivo aqui</p>
                    <p className="text-sm text-slate-400 mt-1">Formatos suportados: .xlsx, .xls</p>
                </div>
            </div>
        </div>
    );

    const limparFormulario = (tipo) => setManualForm({
        nome: '', tipo, turma: '', horario_saida: '', parentesco: '', telefone: '',
        responsavel_id: '', matricula: '', hikvision_employee_id: '', departamento: ''
    });

    const renderStaffImport = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                <h3 className="text-lg font-bold text-navy-500 mb-2">Importar Servidores via Excel</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Planilha <strong>.xlsx</strong> com as colunas:
                    <br />
                    <code className="text-xs bg-soft-100 px-2 py-1 rounded">nome, hikvision_employee_id, tipo, departamento, matricula</code>
                    <br />
                    <span className="text-xs">
                        <strong>nome</strong> é obrigatório · <strong>matricula</strong> em branco recebe a próxima
                        FUNC-### · <strong>tipo</strong> aceita PROFESSOR ou FUNCIONARIO (em branco assume
                        FUNCIONARIO) · <strong>departamento</strong> é texto livre (Vie Scolaire, Serviços Gerais,
                        Administração, Direção…).
                    </span>
                    <br />
                    <span className="text-xs text-slate-400">
                        Alunos não entram por aqui — continuam vindo da importação Pronote.
                    </span>
                </p>

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
                    <p className="font-bold text-navy-500">Clique ou arraste a planilha de servidores</p>
                    <p className="text-sm text-slate-400 mt-1">Formatos suportados: .xlsx, .xls</p>
                </div>
            </div>

            {staffImportErrors.length > 0 && (
                <div className="bg-danger-50 border border-danger-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-danger-700 text-sm">
                            {staffImportErrors.length} linha(s) recusada(s)
                        </p>
                        <button
                            onClick={() => setStaffImportErrors([])}
                            className="text-xs font-bold text-danger-700 underline hover:no-underline"
                        >
                            Fechar
                        </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left text-danger-700/70 uppercase font-bold">
                                    <th className="py-1 pr-3">Linha</th>
                                    <th className="py-1 pr-3">Nome</th>
                                    <th className="py-1">Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffImportErrors.map((e, i) => (
                                    <tr key={i} className="border-t border-danger-100 align-top">
                                        <td className="py-1 pr-3 font-mono text-danger-700">{e.linha}</td>
                                        <td className="py-1 pr-3 text-navy-500">{e.nome}</td>
                                        <td className="py-1 text-slate-600">{e.erro}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
                    title: 'Servidor cadastrado',
                    message: `${resultado.nome} — matrícula ${resultado.matricula}`
                        + (resultado.hikvisionEmployeeId
                            ? ` · ID Hikvision ${resultado.hikvisionEmployeeId}`
                            : ' · SEM identificador Hikvision: a face não será reconhecida'),
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
                throw new Error(resposta.message || 'Falha ao cadastrar usuário');
            }

            if (window.userCache?.reload) await window.userCache.reload();
            onShowToast({ title: 'Sucesso', message: `${manualForm.nome} cadastrado com sucesso!`, type: 'success' });
            limparFormulario('ALUNO');
        } catch (error) {
            console.error(error);
            onShowToast({
                title: 'Cadastro não realizado',
                message: error.message || 'Falha ao cadastrar',
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
                        title: 'Planilha vazia',
                        message: 'Nenhuma linha com a coluna "nome" preenchida.',
                        type: 'error'
                    });
                    return;
                }

                onShowToast({
                    title: 'Importando servidores...',
                    message: `Enviando ${payload.length} registros.`, type: 'info'
                });

                const result = await window.api.createStaffBulk(payload);
                if (window.userCache?.reload) await window.userCache.reload();

                if (result.falhas === 0) {
                    onShowToast({
                        title: 'Importação concluída',
                        message: `${result.sucesso} servidores cadastrados.`,
                        type: 'success'
                    });
                } else {
                    // Erro POR LINHA na própria tela, não só no console: quem
                    // importa a planilha precisa saber qual linha corrigir.
                    setStaffImportErrors(result.detalheErros || []);
                    onShowToast({
                        title: `Importação parcial: ${result.sucesso}/${result.totalRecebido}`,
                        message: `${result.falhas} linha(s) recusada(s) — veja a lista abaixo.`,
                        type: 'warning'
                    });
                }
            } catch (err) {
                console.error('Erro na importação de servidores:', err);
                onShowToast({
                    title: 'Erro',
                    message: err.message || 'Falha ao processar a planilha.',
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
            <form onSubmit={handleManualSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo *</label>
                        <input
                            required
                            type="text"
                            className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                            value={manualForm.nome}
                            onChange={e => setManualForm({ ...manualForm, nome: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Tipo de Usuário</label>
                        <select
                            className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                            value={manualForm.tipo}
                            onChange={e => setManualForm({ ...manualForm, tipo: e.target.value })}
                        >
                            <option value="ALUNO">Aluno</option>
                            <option value="RESPONSAVEL">Responsável</option>
                            <option value="PROFESSOR">Professor</option>
                            <option value="FUNCIONARIO">Funcionário</option>
                        </select>
                    </div>

                    {manualForm.tipo === 'ALUNO' && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Turma</label>
                                <input
                                    type="text"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.turma}
                                    onChange={e => setManualForm({ ...manualForm, turma: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Horário de Saída (Turma)</label>
                                <input
                                    type="time"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.horario_saida}
                                    onChange={e => setManualForm({ ...manualForm, horario_saida: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">ID do Responsável</label>
                                <input
                                    type="text"
                                    placeholder="Ex: R001"
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
                                <label className="block text-xs font-bold text-slate-500 mb-1">Matrícula</label>
                                <input
                                    type="text"
                                    placeholder={proximaMatricula ? `Automático: ${proximaMatricula}` : 'Automático'}
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.matricula}
                                    onChange={e => setManualForm({ ...manualForm, matricula: e.target.value })}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Em branco, o sistema emite a próxima da sequência.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Identificador Hikvision
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Ex: 1234567890"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.hikvision_employee_id}
                                    onChange={e => setManualForm({ ...manualForm, hikvision_employee_id: e.target.value })}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    employeeNo do HikCentral (10 dígitos) — é ele que liga a face ao cadastro.
                                </p>
                            </div>

                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Departamento</label>
                                <input
                                    type="text"
                                    list="magbo-departamentos"
                                    placeholder="Ex: Vie Scolaire, Serviços Gerais, Direção"
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
                                <label className="block text-xs font-bold text-slate-500 mb-1">Parentesco</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Pai, Mãe"
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.parentesco}
                                    onChange={e => setManualForm({ ...manualForm, parentesco: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Telefone</label>
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

                <div className="pt-4 mt-6 border-t border-soft-200">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-accent-500 text-white font-bold rounded-xl hover:bg-accent-600 transition-colors shadow-lg shadow-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting
                            ? 'CADASTRANDO...'
                            : (ehServidor ? 'CADASTRAR SERVIDOR' : 'CADASTRAR NOVO USUÁRIO')}
                    </button>
                </div>
            </form>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-[24px] w-full max-w-2xl shadow-2xl overflow-hidden animate-zoom-in">

                {/* Header */}
                <div className="bg-navy-500 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                            <LucideIcon name="settings" size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Configurações e Cadastros</h2>
                            <p className="text-xs text-white/50">Gerencie o sistema e importe usuários</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
                        <LucideIcon name="x" size={20} />
                    </button>
                </div>

                <div className="flex">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-slate-50 border-r border-soft-200 p-4 space-y-2">
                        <button
                            onClick={() => setActiveTab('import')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'import' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="file-spreadsheet" size={18} className={activeTab === 'import' ? 'text-accent-500' : 'text-slate-400'} />
                            Importar Excel
                        </button>
                        <button
                            onClick={() => setActiveTab('staff-import')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'staff-import' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="users" size={18} className={activeTab === 'staff-import' ? 'text-accent-500' : 'text-slate-400'} />
                            Importar Servidores
                        </button>
                        <button
                            onClick={() => setActiveTab('manual')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'manual' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="user-plus" size={18} className={activeTab === 'manual' ? 'text-accent-500' : 'text-slate-400'} />
                            Cadastro Manual
                        </button>
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-semibold text-left ${activeTab === 'general' ? 'bg-accent-50 text-accent-700' : 'text-slate-600 hover:bg-white'}`}
                        >
                            <LucideIcon name="cog" size={18} className={activeTab === 'general' ? 'text-accent-500' : 'text-slate-400'} />
                            Gerais
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-6 bg-white min-h-[400px]">
                        {activeTab === 'import' && renderImportSettings()}
                        {activeTab === 'staff-import' && renderStaffImport()}
                        {activeTab === 'manual' && renderManualRegistration()}
                        {activeTab === 'general' && renderGeneralSettings()}
                    </div>
                </div>
            </div>
        </div>
    );
}
