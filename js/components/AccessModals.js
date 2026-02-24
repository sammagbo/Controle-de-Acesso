// =====================================================================
// ACCESS MODALS
// =====================================================================

function PortariaModal({ responsavel, alunos = [], onConfirm, onCancel }) {
    if (!responsavel) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white/95 rounded-[32px] w-full max-w-4xl shadow-2xl overflow-hidden border border-white/20 animate-zoom-in flex flex-col max-h-[90vh]">
                <div className="p-8 space-y-6 overflow-y-auto w-full">

                    {/* ALUNOS ROWS */}
                    {alunos.map(aluno => (
                        <div key={aluno.id} className="flex items-center gap-8 bg-soft-50 p-6 rounded-3xl border border-soft-200">
                            <img src={aluno.foto_url} alt={aluno.nome} className="w-24 h-24 rounded-full shadow-md border-4 border-white flex-shrink-0" />
                            <div className="flex-1 space-y-3 min-w-0">
                                <div className="bg-white border border-soft-200 rounded-xl px-4 py-2 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do Aluno(a)</p>
                                    <h2 className="text-xl font-black text-navy-500 truncate">{aluno.nome}</h2>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white border border-soft-200 rounded-xl px-4 py-2 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Turma</p>
                                        <p className="text-sm font-bold text-navy-500 truncate">{aluno.turma || '-'}</p>
                                    </div>
                                    <div className="bg-white border border-soft-200 rounded-xl px-4 py-2 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Turno</p>
                                        <p className="text-sm font-bold text-navy-500 truncate">{aluno.turno || '-'}</p>
                                    </div>
                                    <div className="bg-white border border-soft-200 rounded-xl px-4 py-2 shadow-sm flex flex-col justify-center">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
                                        <p className="text-sm font-bold text-success-600">Liberado ✅</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* RESPONSAVEL ROW */}
                    <div className="flex items-center gap-8 bg-white p-6 rounded-3xl border-2 border-accent-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-accent-50 rounded-bl-full opacity-50"></div>
                        <img src={responsavel.foto_url} alt={responsavel.nome} className="w-28 h-28 rounded-full shadow-md border-4 border-white flex-shrink-0 relative z-10" />
                        <div className="flex-1 space-y-3 relative z-10 min-w-0">
                            <div className="bg-soft-50 border border-soft-200 rounded-xl px-4 py-2 shadow-sm">
                                <p className="text-[10px] font-bold text-accent-600 uppercase tracking-wider mb-1">Responsável pela Retirada</p>
                                <h2 className="text-2xl font-black text-navy-500 truncate">{responsavel.nome}</h2>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-soft-50 border border-soft-200 rounded-xl px-4 py-2 shadow-sm">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parentesco</p>
                                    <p className="text-sm font-bold text-navy-500 truncate">{responsavel.parentesco || 'Responsável'}</p>
                                </div>
                                <div className="bg-soft-50 border border-soft-200 rounded-xl px-4 py-2 shadow-sm col-span-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contato</p>
                                    <p className="text-sm font-bold text-navy-500 truncate">{responsavel.telefone || '-'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* FOOTER BUTTONS */}
                <div className="grid grid-cols-2 gap-4 p-6 bg-slate-50 border-t border-soft-200 shrink-0">
                    <button
                        onClick={onCancel}
                        className="py-4 rounded-2xl bg-danger-50 text-danger-600 font-bold text-lg hover:bg-danger-100 transition-colors border border-danger-200"
                    >
                        CANCELAR
                    </button>
                    <button
                        onClick={onConfirm}
                        className="py-4 rounded-2xl bg-success-500 text-white font-bold text-lg hover:bg-success-600 transition-colors shadow-lg shadow-success-500/30"
                    >
                        CONFIRMAR SAÍDA
                    </button>
                </div>
            </div>
        </div>
    );
}

function PermanenciaModal({ user, bannerProps, onClose }) {
    if (!user) return null;

    // Auto-close after 5 seconds if not an error alert that needs manual dismissal
    React.useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const isAlert = bannerProps.type === 'alert';
    const bannerBg = isAlert ? 'bg-danger-500' : 'bg-success-500';
    const bannerShadow = isAlert ? 'shadow-danger-500/40' : 'shadow-success-500/40';

    return (
        <div className="fixed inset-0 z-[100] bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white/95 rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden border border-white/20 animate-zoom-in">
                <div className="p-8 flex flex-col items-center text-center">

                    <img
                        src={user.foto_url}
                        alt={user.nome}
                        className="w-40 h-40 rounded-full shadow-xl border-4 border-white mb-6"
                    />

                    <div className={`w-full py-4 px-6 rounded-2xl ${bannerBg} shadow-xl ${bannerShadow} mb-8 transform transition-all`}>
                        <h2 className="text-xl md:text-2xl font-black text-white tracking-widest uppercase">
                            {bannerProps.text}
                        </h2>
                        {bannerProps.subtext && (
                            <p className="text-white/90 font-bold mt-1 text-lg">
                                {bannerProps.subtext}
                            </p>
                        )}
                    </div>

                    <div className="w-full space-y-3">
                        <div className="bg-soft-50 border border-soft-200 rounded-2xl px-6 py-4 shadow-sm w-full">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Nome do Aluno</p>
                            <h3 className="text-2xl font-black text-navy-500">{user.nome}</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 shadow-sm">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Turma</p>
                                <p className="text-base font-bold text-navy-500">{user.turma || '-'}</p>
                            </div>
                            <div className="bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 shadow-sm">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Turno</p>
                                <p className="text-base font-bold text-navy-500">{user.turno || '-'}</p>
                            </div>
                            <div className="bg-soft-50 border border-soft-200 rounded-xl px-4 py-3 shadow-sm">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo</p>
                                <p className="text-base font-bold text-navy-500">{user.tipo}</p>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Optional OK Button to close manually */}
                <div className="p-6 bg-slate-50 border-t border-soft-200">
                    <button
                        onClick={onClose}
                        className="w-full py-4 rounded-2xl bg-white text-navy-500 font-bold text-lg hover:bg-soft-100 transition-colors border border-soft-200 shadow-sm"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
