// =====================================================================
// AINDA DENTRO — quem o sistema vai fechar, antes de ele fechar
// =====================================================================
// O fechamento automático grava uma SAIDA sintética às 17:00 para quem ficou
// com a presença aberta no CDI. Ele funciona, é idempotente, e fazia tudo isso
// SEM QUE NINGUÉM VISSE: até 15/08/2026 não havia rota nenhuma expondo nem a
// lista, nem o cálculo — que só existia dentro da chamada que já gravava.
//
// ⚠️ POR QUE UM INDICADOR NO CABEÇALHO, e não um bloco na tela. Medido com o
// app aberto e 31 presenças (o número real de um dia de CDI): o painel fixo
// ocupava 256 dos 761 px da viewport — UM TERÇO da tela do operador, o dia
// inteiro — e nesse terço mostrava DOIS dos 31 nomes. Grande demais para ser
// discreto e pequeno demais para ser lista, ao mesmo tempo. E o operador do CDI
// não decide nada sobre aqueles nomes: o fechamento é automático e quem vai
// buscar a criança é a Vie Scolaire. O número fica visível — é útil, ele sabe
// quantos estão lá — e a lista fica a um clique de quem quiser agir.
//
// ⚠️ POR QUE UMA TELA CONSULTÁVEL A QUALQUER HORA, e não um aviso de fim de dia.
// O trabalho roda a cada 5 minutos e fecha assim que a hora passa. Um aviso
// chegaria quando a criança já foi carimbada como tendo saído às 17:00 e quem o
// lê só pode concordar. Um indicador aberto às 16h40, na tela onde a pessoa que
// pode ir ao CDI já está, ainda permite ir olhar — que é o único momento em que
// esta informação muda alguma coisa. Depois das 17:00 ele passa a responder a
// outra pergunta, igualmente legítima: "quem fechamos hoje?".
//
// ⚠️ E ELE NÃO ACUSA NINGUÉM. Uma presença aberta é quase sempre uma SAÍDA que
// o terminal não viu — é exatamente por isso que o fechamento automático
// existe. A frase fica no topo do modal, em destaque, e não num rodapé.

/**
 * O PAINEL — só desenha. Quem busca é o indicador, abaixo.
 *
 * ⚠️ Presentacional de propósito: com o invólucro virando modal, um componente
 * que buscasse sozinho faria uma SEGUNDA requisição ao abrir, ao lado da que o
 * indicador já fez. Os dados descem por prop; nada aqui toca a rede.
 */
function FinDeJournee({ linhas }) {
    const t = useI18n();

    const lista = linhas || [];
    const abertos = lista.filter(l => !l.jaFechado);
    const fechados = lista.filter(l => l.jaFechado);

    // ⚠️ A hora vem de QUALQUER linha, e por isso o vazio precisa de outra
    // saída: com a lista vazia — o estado normal na maior parte do dia, e
    // justamente a boa notícia — o subtítulo saía «Clôture automatique à  — le
    // temps d'aller voir», com a preposição pendurada e sem hora. Sem linha
    // nenhuma o cabeçalho omite a hora em vez de deixar um buraco no meio da
    // frase. (Painel de revisão, i18n, 15/08/2026.)
    const hora = (lista[0] && lista[0].horaFechamento) || null;

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
        <div>
            <p className="font-bold text-navy-500 text-sm">{t('finjournee.titulo')}</p>
            <p className="text-xs text-slate-500 mb-3">
                {hora ? t('finjournee.subtitulo', { hora }) : t('finjournee.subtitulo.sem.hora')}
            </p>

            {abertos.length > 0 && hora && (
                <p className="text-xs text-warning-600 bg-warning-50 border border-warning-500/40 rounded-xl px-3 py-2 mb-3">
                    {t('finjournee.aviso', { hora })}
                </p>
            )}

            {lista.length === 0 ? (
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

/**
 * O INVÓLUCRO — a pastilha no cabeçalho do CDI, e o modal que ela abre.
 *
 * ⚠️ ZERO APARECE, e a decisão tem motivo. Um indicador que some quando não há
 * ninguém dentro é indistinguível de um indicador que quebrou — e este painel
 * existe justamente porque o fechamento automático acontecia sem ninguém ver.
 * Mostrar "0" prova que a pergunta foi feita e respondida. Quem some é outro
 * caso, e só ele: o ponto SEM fechamento configurado (204), onde a pergunta não
 * se aplica — ali um "0" seria boa notícia falsa, porque ninguém será fechado
 * nunca. É por isso que a camada HTTP devolve TRÊS estados e não um array.
 *
 *   NAO_APLICAVEL  →  a pastilha não existe
 *   OK, 0 linhas   →  "0", em cinza (viva, e nada a fazer)
 *   OK, N linhas   →  "N", âmbar quando há alguém ainda aberto
 *   ERRO           →  "?" em vermelho — nunca zero, nunca ausente
 *
 * ⚠️ O NÚMERO SEGUE O RELÓGIO DA TELA. Mesmo ciclo do CDI (`cicloMs`), com
 * trava de voo (js/utils/travaDeVoo.js) para que um endpoint lento não empilhe
 * chamadas, e PAUSA enquanto o modal está aberto — não se move a lista debaixo
 * do dedo de quem a está lendo, que é a mesma disciplina do reload do CDI.
 */
function FinDeJourneeIndicador({ pointId, cicloMs = 3000 }) {
    const t = useI18n();
    const [estado, setEstado] = React.useState('OK');
    const [linhas, setLinhas] = React.useState([]);
    const [aberto, setAberto] = React.useState(false);

    const trava = React.useRef(null);
    if (trava.current === null) trava.current = window.MagboTravaDeVoo.criar();
    const pontoRef = React.useRef(pointId);
    pontoRef.current = pointId;
    const abertoRef = React.useRef(false);
    abertoRef.current = aberto;

    React.useEffect(() => {
        if (!pointId || typeof fetchFinDeJournee !== 'function') return;
        let vivo = true;

        const buscar = async () => {
            if (abertoRef.current) return;          // modal aberto: não mexer
            if (!trava.current.entrar()) return;    // uma requisição no ar já basta
            const pedido = pointId;
            try {
                const r = await fetchFinDeJournee(pedido);
                if (!vivo || !trava.current.aplicavel(pedido, pontoRef.current)) return;
                setEstado(r.estado);
                setLinhas(r.linhas || []);
            } finally {
                // SEMPRE: uma falha que deixasse a trava fechada congelaria o
                // número para sempre — pior do que o defeito que ela conserta.
                trava.current.sair();
            }
        };

        buscar();
        const id = setInterval(buscar, cicloMs);
        return () => { vivo = false; clearInterval(id); };
    }, [pointId, cicloMs]);

    if (estado === 'NAO_APLICAVEL') return null;

    const abertosN = linhas.filter(l => !l.jaFechado).length;
    const erro = estado === 'ERRO';
    const cor = erro
        ? 'bg-danger-100 text-danger-600 border-danger-500/40'
        : abertosN > 0
            ? 'bg-warning-100 text-warning-600 border-warning-500/40'
            : 'bg-soft-100 text-slate-500 border-soft-200';

    return (
        <>
            <button type="button" onClick={() => setAberto(true)}
                title={erro ? t('finjournee.indisponivel') : t('finjournee.indicador.titulo')}
                className={`h-8 px-2.5 rounded border text-xs font-bold flex items-center gap-1.5 hover:brightness-95 ${cor}`}>
                <LucideIcon name="users" size={14} />
                {erro ? '?' : abertosN}
            </button>

            {aberto && (
                <div className="fixed inset-0 z-50 bg-navy-500/40 flex items-start justify-center p-8"
                    onClick={() => setAberto(false)}>
                    {/* O teto de altura vive AQUI, no modal, e não na tela do
                        operador: com 31 nomes ele rola dentro de si e nunca
                        cresce além da janela. */}
                    <div className="bg-soft-50 rounded-2xl border border-soft-200 shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end p-3 pb-0 shrink-0">
                            <button type="button" onClick={() => setAberto(false)}
                                className="text-xs font-bold text-slate-500 hover:text-navy-500">
                                {t('incompletos.fechar')}
                            </button>
                        </div>
                        <div className="px-5 pb-5 overflow-y-auto">
                            {erro ? (
                                <p className="text-sm text-danger-600 py-6 text-center">
                                    {t('finjournee.indisponivel')}
                                </p>
                            ) : (
                                <FinDeJournee linhas={linhas} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
