// =====================================================================
// APP SETTINGS & REGISTRATION MODAL
// =====================================================================

function AppSettingsModal({ onClose, onShowToast }) {
    const [activeTab, setActiveTab] = React.useState('import'); // 'general', 'import', 'manual'

    // --- Manual Registration State ---
    const [manualForm, setManualForm] = React.useState({
        nome: '',
        tipo: 'ALUNO',
        turma: '',
        turno: '',
        parentesco: '',
        telefone: '',
        responsavel_id: ''
    });

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
                        <button className="w-12 h-6 bg-slate-200 rounded-full relative transition-colors cursor-not-allowed">
                            <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target.result;
                const workbook = window.XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = window.XLSX.utils.sheet_to_json(worksheet);

                let addedCount = 0;
                json.forEach(row => {
                    if (row.Nome) {
                        const newUser = {
                            id: row.ID || `USR${Date.now()}${Math.floor(Math.random() * 1000)}`,
                            nome: row.Nome,
                            tipo: row.Tipo || 'ALUNO',
                            turma: row.Turma || '',
                            turno: row.Turno || '',
                            foto_url: row.Foto || `https://api.dicebear.com/7.x/initials/svg?seed=${row.Nome.replace(' ', '')}&backgroundColor=3B82F6`
                        };

                        if (row.Tipo === 'RESPONSAVEL') {
                            newUser.telefone = row.Telefone || '';
                            newUser.parentesco = row.Parentesco || 'Responsável';
                            window.RESPONSAVEIS.push(newUser);
                        }

                        // Add everyone to USERS for unified search
                        window.USERS.push(newUser);
                        addedCount++;
                    }
                });

                onShowToast({ title: 'Sucesso', message: `${addedCount} usuários importados da planilha.`, type: 'success' });
            } catch (err) {
                console.error(err);
                onShowToast({ title: 'Erro', message: 'Falha ao processar o arquivo Excel.', type: 'error' });
            }
        };
        reader.readAsBinaryString(file);
    };

    const renderImportSettings = () => (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-soft-50 p-6 rounded-2xl border border-soft-200">
                <h3 className="text-lg font-bold text-navy-500 mb-2">Importar Cadastro via Excel</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Envie uma planilha com as colunas: <strong>ID, Nome, Tipo, Turma, Turno, Telefone, Parentesco</strong>.
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

    const handleManualSubmit = (e) => {
        e.preventDefault();

        const newId = `USR${Date.now()}`;
        const newUser = {
            id: newId,
            nome: manualForm.nome,
            tipo: manualForm.tipo,
            turma: manualForm.turma,
            turno: manualForm.turno,
            foto_url: `https://api.dicebear.com/7.x/initials/svg?seed=${manualForm.nome.replace(' ', '')}&backgroundColor=10B981`
        };

        if (manualForm.tipo === 'RESPONSAVEL') {
            newUser.telefone = manualForm.telefone;
            newUser.parentesco = manualForm.parentesco;
            window.RESPONSAVEIS.push(newUser);
        } else if (manualForm.tipo === 'ALUNO') {
            newUser.responsavel_id = manualForm.responsavel_id;
        }

        window.USERS.push(newUser);

        onShowToast({ title: 'Sucesso', message: `${manualForm.nome} cadastrado com sucesso!`, type: 'success' });

        // Reset form
        setManualForm({
            nome: '', tipo: 'ALUNO', turma: '', turno: '', parentesco: '', telefone: '', responsavel_id: ''
        });
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
                                <label className="block text-xs font-bold text-slate-500 mb-1">Turno</label>
                                <select
                                    className="w-full bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent-500"
                                    value={manualForm.turno}
                                    onChange={e => setManualForm({ ...manualForm, turno: e.target.value })}
                                >
                                    <option value="">Selecione</option>
                                    <option value="Manhã">Manhã</option>
                                    <option value="Tarde">Tarde</option>
                                    <option value="Integral">Integral</option>
                                </select>
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
                    <button type="submit" className="w-full py-3 bg-accent-500 text-white font-bold rounded-xl hover:bg-accent-600 transition-colors shadow-lg shadow-accent-500/30">
                        CADASTRAR NOVO USUÁRIO
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
                        {activeTab === 'manual' && renderManualRegistration()}
                        {activeTab === 'general' && renderGeneralSettings()}
                    </div>
                </div>
            </div>
        </div>
    );
}
