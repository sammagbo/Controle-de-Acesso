// =====================================================================
// AINDA DENTRO — quem o sistema vai fechar, antes de ele fechar
// =====================================================================
// O fechamento automático grava uma SAIDA sintética às 17:00 para quem ficou
// com a presença aberta no CDI. Ele funciona, é idempotente, e fazia tudo isso
// SEM QUE NINGUÉM VISSE: até 15/08/2026 não havia rota nenhuma expondo nem a
// lista, nem o cálculo — que só existia dentro da chamada que já gravava.
//
// ⚠️ POR QUE UMA TELA CONSULTÁVEL A QUALQUER HORA, e não um aviso de fim de dia.
// O trabalho roda a cada 5 minutos e fecha assim que a hora passa. Um aviso
// chegaria quando a criança já foi carimbada como tendo saído às 17:00 e quem o
// lê só pode concordar. Um painel aberto às 16h40, na tela onde a pessoa que
// pode ir ao CDI já está sentada, ainda permite ir olhar — que é o único
// momento em que esta informação muda alguma coisa. Depois das 17:00 ele passa
// a responder a outra pergunta, igualmente legítima: "quem fechamos hoje?".
//
// ⚠️ E ELE NÃO ACUSA NINGUÉM. Uma presença aberta é quase sempre uma SAÍDA que
// o terminal não viu — é exatamente por isso que o fechamento automático
// existe. A frase fica no topo, em destaque, e não num rodapé.

function FinDeJournee({ pointId }) {
    const t = useI18n();

    // null = ainda carregando OU ponto sem fechamento configurado; os dois
    // casos são distinguidos por `aplicavel`, porque "não se aplica aqui" e
    // "não há ninguém" são notícias diferentes e uma delas não é boa notícia.
    const [linhas, setLinhas] = React.useState(null);
    const [aplicavel, setAplicavel] = React.useState(true);

    React.useEffect(() => {
        if (!pointId || typeof fetchFinDeJournee !== 'function') return;
        let vivo = true;
        (async () => {
            const r = await fetchFinDeJournee(pointId);
            if (!vivo) return;
            // null do fetch = 204 (ponto sem fechamento) ou falha de rede.
            setAplicavel(r !== null);
            setLinhas(Array.isArray(r) ? r : []);
        })();
        return () => { vivo = false; };
        // ⚠️ Sem polling próprio. A lista muda quando alguém passa, e a tela
        // inteira já recarrega nesse ritmo; um intervalo aqui seria uma segunda
        // consulta por ciclo ao mesmo dado — o defeito que o SectorView já
        // pagou uma vez com os veredictos do portão.
    }, [pointId]);

    // Ponto sem fechamento configurado: o painel não aparece. Dizer
    // "ninguém será fechado" na portaria seria verdade e mentira ao mesmo
    // tempo — ninguém será fechado ali NUNCA, e isso não é uma boa notícia.
    if (!aplicavel || linhas === null) return null;

    const abertos = linhas.filter(l => !l.jaFechado);
    const fechados = linhas.filter(l => l.jaFechado);
    const hora = (linhas[0] && linhas[0].horaFechamento) || '';

    const linha = (l, i) => (
        <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-soft-200">
            <span className="font-bold text-sm text-navy-500 truncate">
                {l.nome || <span className="font-mono text-slate-500">{l.userId}</span>}
            </span>
            <span className="text-xs text-slate-400 shrink-0">{l.turma}</span>
            {/* O fechamento não filtra por tipo: servidor entra no CDI por
                trinta segundos e sai sem passar o rosto. Quem lê precisa
                distinguir criança de colega num relance. */}
            {l.tipo && l.tipo !== 'ALUNO' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-soft-100 text-slate-500 shrink-0">
                    {t('finjournee.nao.aluno')}
                </span>
            )}
            <span className="text-xs text-slate-500 flex-1 truncate">
                {l.jaFechado
                    ? t('finjournee.ja.fechado', { hora: l.horaFechamento })
                    : t('finjournee.desde', { hora: l.horaEntrada })}
            </span>
        </div>
    );

    return (
        <div className="bg-soft-50 rounded-2xl border border-soft-200 p-4 mb-4">
            <p className="font-bold text-navy-500 text-sm">{t('finjournee.titulo')}</p>
            <p className="text-xs text-slate-500 mb-3">{t('finjournee.subtitulo', { hora })}</p>

            {abertos.length > 0 && (
                <p className="text-xs text-warning-600 bg-warning-50 border border-warning-500/40 rounded-xl px-3 py-2 mb-3">
                    {t('finjournee.aviso', { hora })}
                </p>
            )}

            {linhas.length === 0 ? (
                <div className="flex items-center gap-2 text-success-600 text-sm py-2">
                    <LucideIcon name="check-circle-2" size={16} className="text-success-500" />
                    {t('finjournee.vazio')}
                </div>
            ) : (
                <>
                    {abertos.length > 0 && (
                        <div className="mb-3">
                            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                                {t('finjournee.grupo.aberto', { hora })} · {abertos.length}
                            </p>
                            <div className="space-y-1.5">{abertos.map(linha)}</div>
                        </div>
                    )}
                    {fechados.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                                {t('finjournee.grupo.fechado')} · {fechados.length}
                            </p>
                            <div className="space-y-1.5 opacity-70">{fechados.map(linha)}</div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
