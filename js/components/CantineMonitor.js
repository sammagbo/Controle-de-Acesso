// =====================================================================
// MONITEUR CANTINE — o quadro do refeitório, em tempo real
// =====================================================================
// A ORDEM DAS COLUNAS SEGUE A ORDEM DA REALIDADE:
//
//   DANS LA CANTINE  →  DOIT SORTIR  →  SORTIS
//   (está a comer)      (demorou)       (acabou)
//
// ⚠️ Até 24/08/2026 «Sortis» ficava no MEIO, entre as duas colunas de gente
// que ainda está lá dentro. A única coluna sobre a qual o operador pode AGIR
// — a dos que passaram do tempo — estava encostada à borda, depois da coluna
// que já não pede nada de ninguém. Quem trabalha ao balcão lê a tela da
// esquerda para a direita: agora as duas primeiras são as duas que importam.
// Isto é ORDEM DE APRESENTAÇÃO — nenhuma regra, nenhum cálculo e nenhum
// registo mudaram com ela.
//
// ⚠️ AS REGRAS VIVEM EM js/utils/cantine.js, e não aqui. Nada neste projeto
// renderiza React numa suíte: tudo o que ficasse dentro deste componente
// ficaria por provar. As três afirmações que a tela faz sobre uma criança
// — «está dentro», «ficou tempo demais», «passou sem comer» — passaram para
// um módulo puro, com teste.
//
// ⚠️ E OS NÚMEROS VÊM DO SERVIDOR (`magbo.cantine.*`, por
// GET /api/access/report-config). Havia aqui um `STAY_LIMIT_MS = 1h` e no Java
// um `MAX_CANTINA_TIME = 1h`: dois números iguais por coincidência, que na
// primeira mudança passariam a discordar sem nada acusar. É o mesmo defeito
// que `f442db9` corrigiu para o piso de visita, e a mesma solução.

/**
 * O CABEÇALHO DE UMA COLUNA.
 *
 * ⚠️ NO ESCOPO DO MÓDULO pela mesma razão que
 * {@link CantineDecantadosIndicador}, e este foi o segundo andar da mesma
 * armadilha. Definido dentro do `CantineMonitor`, cada render dava ao React um
 * TIPO novo — e o React desmonta a subárvore inteira de um tipo que mudou,
 * levando com ela a pastilha que este cabeçalho recebe em `extra`. O indicador
 * já estava no escopo do módulo e MESMO ASSIM perdia o estado: não basta o
 * filho estar fora, o caminho até ele tem de estar também.
 *
 * Descoberto a abrir a tela: o modal não abria de todo. Um cabeçalho sem
 * estado próprio parecia inofensivo, e era ele que apagava o do vizinho.
 */
function CantineColumnHeader({ icon, title, count, color, extra }) {
    return (
        <div className="mb-3 px-1">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
                        <LucideIcon name={icon} size={18} className="text-white" />
                    </div>
                    <h3 className="text-sm font-black text-navy-500 uppercase tracking-wide truncate">{title}</h3>
                </div>
                <span className="text-sm font-black text-slate-400 flex-shrink-0">{count}</span>
            </div>
            {/* ⚠️ A PASTILHA VAI PARA UMA LINHA SÓ DELA, e não ao lado do
                título. Na primeira versão partilhava a linha e, numa coluna de um
                terço de largura, «DOIT SORTIR» aparecia na tela como «DOI…»: a
                única coluna sobre a qual alguém age tinha o nome cortado por um
                aviso secundário. Visto num screenshot, não num teste — o texto
                estava todo no DOM e qualquer asserção sobre ele passava. */}
            {extra && <div className="mt-2 flex">{extra}</div>}
        </div>
    );
}

/**
 * O QUE FOI RETIRADO DA VISTA — e o caminho de volta.
 *
 * ⚠️ NO ESCOPO DO MÓDULO, como {@link CantineDecantadosIndicador} e
 * {@link CantineColumnHeader}, e pela mesma razão já paga duas vezes nesta
 * tela: um componente COM ESTADO escrito dentro do `CantineMonitor` recebe um
 * tipo novo a cada render, o React desmonta-o, e o modal fecha-se sozinho no
 * ciclo seguinte de 3 s.
 *
 * ⚠️ E ESTE MODAL EXISTE PORQUE A RETIRADA É REVERSÍVEL. Sem ele, um clique
 * confirmado por engano esconderia uma pessoa até à meia-noite num ecrã cuja
 * única função é dizer quem está no refeitório. A confirmação protege do
 * clique distraído; isto protege do clique confirmado por engano.
 *
 * ⚠️ Quem retirou e a que horas ficam à vista, e não escondidos numa consulta
 * ao banco. A pergunta que este ecrã tem de responder amanhã é «porque é que
 * esta pessoa não estava na lista?», e a resposta tem de estar onde a pergunta
 * nasce.
 */
function CantineRetiradasIndicador({ linhas, podeDevolver, onDevolver, onAberto }) {
    const t = useI18n();
    const [aberto, setAberto] = React.useState(false);

    React.useEffect(() => {
        if (typeof onAberto === 'function') onAberto(aberto);
    }, [aberto, onAberto]);

    const lista = linhas || [];
    if (lista.length === 0) return null;

    const hora = (iso) => {
        const d = new Date(iso);
        return isFinite(d.getTime())
            ? d.toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' })
            : '--:--';
    };

    return (
        <>
            <button type="button" onClick={() => setAberto(true)}
                className="text-xs font-bold text-slate-500 hover:text-navy-500 underline underline-offset-2 flex-shrink-0">
                {t('cantina.retiradas.ver')}
            </button>

            {aberto && (
                <div className="fixed inset-0 z-50 bg-navy-500/40 flex items-start justify-center p-8"
                    onClick={() => setAberto(false)}>
                    <div className="bg-soft-50 rounded-2xl border border-soft-200 shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end p-3 pb-0 shrink-0">
                            <button type="button" onClick={() => setAberto(false)}
                                className="text-xs font-bold text-slate-500 hover:text-navy-500">
                                {t('cantina.fechar')}
                            </button>
                        </div>
                        <div className="px-5 pb-5 overflow-y-auto">
                            <p className="font-bold text-navy-500 text-sm">{t('cantina.retiradas.titulo')}</p>
                            <p className="text-xs text-slate-500 mb-3">{t('cantina.retiradas.ajuda')}</p>
                            <div className="space-y-1.5">
                                {lista.map((r, i) => {
                                    const u = window.userCache?.byId(r.userId);
                                    return (
                                        <div key={(r.userId || '') + (r.pointId || '') + i}
                                            className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-soft-200">
                                            <span className="font-bold text-sm text-navy-500 truncate">
                                                {window.MagboIdentity.resolver({ pessoa: u, userId: r.userId }, { lang: 'fr' }).nome}
                                            </span>
                                            {u && u.turma && (
                                                <span className="text-xs text-slate-400 shrink-0">{u.turma}</span>
                                            )}
                                            <span className="text-xs text-slate-500 flex-1 truncate text-right">
                                                {t('cantina.retiradas.por', {
                                                    quem: r.removidoPor || '?', hora: hora(r.removidoEm)
                                                })}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onDevolver && onDevolver(r)}
                                                disabled={!podeDevolver}
                                                className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${
                                                    podeDevolver
                                                        ? 'text-accent-600 hover:bg-accent-50'
                                                        : 'text-slate-300 cursor-not-allowed'
                                                }`}>
                                                {t('cantina.retiradas.devolver')}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/**
 * A ETIQUETA DE DURACAO de uma linha de SORTIS.
 *
 * ⚠️ SEM COLUNA PROPRIA, de proposito (justificacao restaurada apos o panel de
 * 27/08 — tinha-se perdido na mudanca de escopo): uma quarta coluna para
 * «passou sem comer» daria a uma observacao o mesmo peso visual que ao facto
 * de a pessoa estar ou nao no refeitorio. A marca fica NA LINHA.
 *
 * ⚠️ E SO APARECE COM OS DOIS LEITORES ATRAVESSADOS. Sem ENTRADA emparelhada
 * nao ha duracao (`faixa` null -> «entree non enregistree»): inventar uma a
 * partir do inicio do servico marcaria como «passou sem comer» exatamente quem
 * o leitor da entrada nao viu — o defeito de producao de 24/08 virado acusacao.
 *
 * ⚠️ NO ESCOPO DO MODULO — quarta e quinta vitimas da mesma doenca neste
 * ficheiro (depois do indicador de decantacao, do cabecalho de coluna e do
 * modal de retiradas): um componente definido DENTRO do CantineMonitor recebe
 * um TIPO novo a cada render, e o monitor renderiza a cada 3 s (polling) e a
 * cada 10 s (relogio). O React nao reconhece o tipo e DESMONTA a subarvore
 * inteira — incluindo o PersonPhoto, que recomecava do zero e pintava as
 * iniciais antes de a foto voltar. Era o scintillement visto em servico.
 * Medido em 27/08/2026: 30 nos <img> novos em 12 s ANTES; 0 DEPOIS.
 */
function CantineEtiquetaDuracao({ ev, cfg }) {
    const t = useI18n();
    if (ev.faixa === 'curta') {
        return (
            <span className="text-xs font-bold text-warning-700 bg-warning-100 border border-warning-500/40 px-1.5 py-0.5 rounded"
                title={t('cantina.duracao.curta.ajuda', { minutos: ev.duracaoMin, limite: cfg.duracaoCurtaMinutos })}>
                {t('cantina.duracao.curta')} · {ev.duracaoMin} min
            </span>
        );
    }
    if (ev.faixa === 'longa') {
        return (
            <span className="text-xs font-semibold text-slate-500">
                {t('cantina.duracao.longa', { minutos: ev.duracaoMin, limite: cfg.duracaoMaximaMinutos })}
            </span>
        );
    }
    if (ev.faixa === 'normal') {
        return (
            <span className="text-xs text-slate-400">
                {t('cantina.duracao.normal', { minutos: ev.duracaoMin })}
            </span>
        );
    }
    return (
        <span className="text-xs text-slate-300 italic">{t('cantina.duracao.sem.par')}</span>
    );
}

/**
 * UMA LINHA do quadro — a pessoa, a foto, o tempo, as marcas, o ×.
 *
 * Ver o javadoc da etiqueta acima: viver AQUI, e nao dentro do monitor, e o
 * que impede o React de a desmontar a cada ciclo de polling. As dependencias
 * do pai descem por PROPS (dim, elapsedLabel, onRetirar...) — props novas so
 * re-renderizam; um tipo novo desmonta.
 */
function CantineCard({ ev, variant, dim, cfg, elapsedLabel, podeRetirar, onRetirar }) {
    const t = useI18n();
    const user = window.userCache?.byId(ev.userId);
    // ⚠️ TRES rotulos DISTINTOS: chegar antes do seu creneau, chegar depois, e
    // o «hors horaire» historico (linhas de antes de 27/08). Fundi-los num so
    // obrigava a Vie Scolaire a ir descobrir qual dos dois aconteceu.
    const flagCreneau = ['AVANT_CRENEAU', 'APRES_CRENEAU', 'FORA_HORARIO'].includes(ev.flag)
        ? ev.flag : null;
    const horsHoraire = !!flagCreneau;
    return (
        <div className={`flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border ${
            variant === 'doit' ? 'border-warning-300' : horsHoraire ? 'border-danger-300' : 'border-soft-200'
        } ${dim ? 'opacity-30' : 'opacity-100'} transition-opacity`}>
            <PersonPhoto userId={user && user.id} nome={user && user.nome} fotoUrl={user && user.foto_url} alt="" className="w-12 h-12 rounded-xl shadow flex-shrink-0 object-cover" />
            <div className="flex-1 min-w-0">
                {/* Nome, nunca a matricula sozinha — o operador da cantina
                    precisa saber QUEM esta na fila, e 0003535 nao diz. */}
                <p className="text-sm font-black text-navy-500 truncate">
                    {window.MagboIdentity.resolver({ pessoa: user, userId: ev.userId }, { lang: 'fr' }).nome}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {user && user.turma && (
                        <span className="text-xs font-bold text-slate-500 bg-soft-100 px-1.5 py-0.5 rounded">{user.turma}</span>
                    )}
                    <span className="text-xs text-slate-400">{elapsedLabel(ev)}</span>
                    {variant === 'sortis' && <CantineEtiquetaDuracao ev={ev} cfg={cfg} />}
                    {flagCreneau && variant !== 'doit' && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            flagCreneau === 'AVANT_CRENEAU'
                                ? 'text-accent-700 bg-accent-50 border border-accent-500/40'
                                : 'text-danger-600 bg-danger-50'}`}>
                            {t('cantina.flag.' + flagCreneau)}
                        </span>
                    )}
                </div>
            </div>
            {/* O × so nas duas colunas de quem o ecra da como AINDA LA
                DENTRO. Em SORTIS nao faz sentido: a pessoa ja saiu, e a
                linha desaparece sozinha. */}
            {(variant === 'dans' || variant === 'doit') && (
                <button
                    type="button"
                    onClick={() => onRetirar(ev)}
                    disabled={!podeRetirar}
                    title={podeRetirar ? t('cantina.retirar.ajuda') : t('cantina.retirar.sem.permissao')}
                    aria-label={t('cantina.retirar')}
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        podeRetirar
                            ? 'text-slate-400 hover:text-danger-600 hover:bg-danger-50'
                            : 'text-slate-200 cursor-not-allowed'
                    }`}>
                    <LucideIcon name="x" size={16} />
                </button>
            )}
        </div>
    );
}

/**
 * A PASTILHA DA DECANTAÇÃO — o mesmo desenho do indicador do CDI.
 *
 * ⚠️ NO ESCOPO DO MÓDULO, e isso NÃO é estilo: é a diferença entre o modal
 * abrir e o modal fechar-se sozinho. Escrito dentro do `CantineMonitor`, cada
 * render do monitor criava um TIPO de componente novo; o React não reconhece o
 * tipo, desmonta e remonta — e o `aberto` local morre com ele. Como o monitor
 * volta a renderizar a cada ciclo de 3 s (polling) e a cada 10 s (relógio), o
 * modal fechava-se sozinho em menos de três segundos, com a lista ainda à
 * frente de quem a estava a ler. Descoberto a ABRIR A TELA, por nenhum teste:
 * `FinDeJourneeIndicador` vive no escopo do módulo pela mesma razão.
 *
 * ⚠️ ZERO NÃO APARECE aqui — ao contrário do CDI, e a diferença tem motivo.
 * Lá a pastilha responde «quantos vamos fechar hoje», pergunta que se faz o dia
 * inteiro e cuja resposta zero é informação. Aqui ela responde «o que já saiu
 * desta coluna», e antes de alguém exceder o tempo não há coluna de que ter
 * saído: a pergunta ainda não existe.
 *
 * ⚠️ E O NÚMERO DA COLUNA NÃO DESCE. O contador do cabeçalho continua a somar
 * quem decantou: a linha sai da LISTA, nunca da conta. Se o total caísse quando
 * a linha decanta, a tela estaria a afirmar que a pessoa saiu do refeitório —
 * que é precisamente o que ninguém sabe.
 */
function CantineDecantadosIndicador({ linhas, decantacaoMinutos, elapsedLabel, onAberto }) {
    const t = useI18n();
    const [aberto, setAberto] = React.useState(false);

    // ⚠️ Avisa o monitor para PARAR o polling enquanto o modal está aberto —
    // mesma disciplina do indicador do CDI: não se move a lista debaixo do dedo
    // de quem a está a ler. Num serviço cheio, um ciclo de 3 s reordenaria a
    // lista sob os olhos do operador enquanto ele procura um nome.
    React.useEffect(() => {
        if (typeof onAberto === 'function') onAberto(aberto);
    }, [aberto, onAberto]);

    if (!linhas || linhas.length === 0) return null;

    // Hora e minuto, sem segundos: `formatTime` traz os segundos porque serve
    // o relogio de «Mis a jour a», que se move. Uma hora de entrada nao se
    // move, e «10:30:00» so acrescenta dois digitos que ninguem le.
    const horaEntrada = (ev) => new Date(ev._t)
        .toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' });

    return (
        <>
            <button type="button" onClick={() => setAberto(true)}
                title={t('cantina.decantados.ajuda', { minutos: decantacaoMinutos })}
                className="h-8 px-2.5 rounded border text-xs font-bold flex items-center gap-1.5 hover:brightness-95 bg-warning-100 text-warning-600 border-warning-500/40">
                <LucideIcon name="history" size={14} />
                {t('cantina.decantados', { n: linhas.length })}
            </button>

            {aberto && (
                <div className="fixed inset-0 z-50 bg-navy-500/40 flex items-start justify-center p-8"
                    onClick={() => setAberto(false)}>
                    {/* O teto de altura vive no modal: com trinta nomes ele rola
                        dentro de si e nunca cresce além da janela. */}
                    <div className="bg-soft-50 rounded-2xl border border-soft-200 shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end p-3 pb-0 shrink-0">
                            <button type="button" onClick={() => setAberto(false)}
                                className="text-xs font-bold text-slate-500 hover:text-navy-500">
                                {t('cantina.fechar')}
                            </button>
                        </div>
                        <div className="px-5 pb-5 overflow-y-auto">
                            <p className="font-bold text-navy-500 text-sm">{t('cantina.decantados.titulo')}</p>
                            <p className="text-xs text-slate-500 mb-3">
                                {t('cantina.decantados.ajuda', { minutos: decantacaoMinutos })}
                            </p>
                            <div className="space-y-1.5">
                                {linhas.map((ev, i) => {
                                    const u = window.userCache?.byId(ev.userId);
                                    return (
                                        <div key={ev.userId}
                                            className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-soft-200">
                                            <span className="font-bold text-sm text-navy-500 truncate">
                                                {window.MagboIdentity.resolver({ pessoa: u, userId: ev.userId }, { lang: 'fr' }).nome}
                                            </span>
                                            {u && u.turma && (
                                                <span className="text-xs text-slate-400 shrink-0">{u.turma}</span>
                                            )}
                                            <span className="text-xs text-slate-500 flex-1 truncate text-right">
                                                {t('cantina.decantados.entrada', { hora: horaEntrada(ev) })}
                                                {' · '}
                                                {t('cantina.decantados.desde', { duracao: elapsedLabel(ev) })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function CantineMonitor() {
    const t = useI18n();
    const [logs, setLogs] = React.useState([]);
    const [lastUpdate, setLastUpdate] = React.useState(null);
    const [now, setNow] = React.useState(Date.now());
    const [query, setQuery] = React.useState('');
    const [cutoff, setCutoff] = React.useState(0); // timestamp do "limpar" manual (0 = sem corte)
    // ⚠️ Enquanto o modal dos decantados está aberto, o monitor PARA de se
    // atualizar — mesma disciplina do indicador do CDI.
    const [modalAberto, setModalAberto] = React.useState(false);

    // As retiradas manuais ATIVAS de hoje (V020). Vêm do servidor no mesmo
    // ciclo das passagens: sem isto, um F5 devolveria à tela todas as linhas
    // que alguém já tinha resolvido, e o botão «Vider l'écran» (que é só
    // memória) voltaria a ser a única ferramenta.
    const [retiradas, setRetiradas] = React.useState([]);

    // ⚠️ DESABILITADO, NUNCA ESCONDIDO — regra do projeto para permissão
    // granular. Quem não pode retirar continua a VER que a retirada existe;
    // um × ausente faria a pessoa concluir que a funcionalidade não existe e
    // pedir ao administrador uma coisa que ele já instalou.
    const podeRetirar = window.MagboPermissions
        ? window.MagboPermissions.canRemoveCantineLines(window.auth)
        : false;

    // Lido de DENTRO dos intervalos, que são montados uma só vez: uma variável
    // de estado ali dentro ficaria congelada no valor da primeira renderização.
    const abertoRef = React.useRef(false);
    abertoRef.current = modalAberto;

    React.useEffect(() => {
        let active = true;
        const poll = async () => {
            // dateFrom=hoje: o monitor descarta tudo antes da meia-noite de
            // qualquer forma (o floor abaixo) — pedir 30 dias só gastava o
            // teto de 500 com passado inútil, e num almoço cheio (250 pessoas
            // × 2 eventos) o teto estourava DENTRO do dia, sumindo gente que
            // ainda estava na fila. Mesma classe do contador preso em 500.
            const data = await fetchRefectoryLogs({ dateFrom: dayKey(new Date()) });
            if (active && Array.isArray(data)) {
                setLogs(data);
                setLastUpdate(new Date());
            }
            // ⚠️ Em requisição SEPARADA e com falha SEPARADA. Se as retiradas
            // não vierem, a tela mostra linhas a MAIS — que é o erro seguro
            // num ecrã que responde «quem está no refeitório». Derrubar as
            // passagens porque a lista de retiradas falhou seria trocar um
            // incómodo por uma tela vazia no meio do serviço.
            try {
                const rs = await window.api?.fetchCantineRemovals?.();
                if (active && Array.isArray(rs)) setRetiradas(rs);
            } catch (e) {
                console.warn('[cantine] retiradas indisponíveis; a tela mostra tudo', e && e.message);
            }
        };
        poll();
        const interval = setInterval(() => { if (!abertoRef.current) poll(); }, 3000);
        // tick local clock every 10s so "doit sortir" updates even without new events
        const clock = setInterval(() => { if (!abertoRef.current) setNow(Date.now()); }, 10000);
        return () => { active = false; clearInterval(interval); clearInterval(clock); };
    }, []);

    // O cálculo inteiro vive em js/utils/cantine.js — ver o cabeçalho.
    const columns = React.useMemo(() => {
        // início do dia de hoje (meia-noite local) — reset diário automático
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        // limite efetivo: o mais recente entre meia-noite e o "limpar" manual
        const floor = Math.max(startOfDay.getTime(), cutoff);

        // ⚠️ `pisoDoDia` (meia-noite) e NAO o `cutoff`: «Vider l'écran» esconde
        // as COLUNAS, e nunca deve zerar os contadores do dia — o comentario
        // deles promete «todos os eventos de hoje», e um botao de limpeza que
        // apagasse a contagem faria a tela mentir ate ao recarregamento.
        // Apanhado pelo painel de revisao em 27/08.
        return window.MagboCantine.classificar(logs, now, {
            pisoDoDiaMs: startOfDay.getTime(),
            pisoMs: floor,
            parseMs: (ts) => new Date(safeDateParse(ts)).getTime(),
            retiradas: retiradas
        });
    }, [logs, now, cutoff, retiradas]);

    const cfg = window.MagboCantine.config();

    // Search across all 3 columns
    const matchesQuery = (ev) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        const user = window.userCache?.byId(ev.userId);
        const nome = (user?.nome || '').toLowerCase();
        const turma = (user?.turma || '').toLowerCase();
        return nome.includes(q) || turma.includes(q) || ev.userId.includes(query.trim());
    };

    const foundColumn = React.useMemo(() => {
        if (!query.trim()) return null;
        if (columns.doitSortir.some(matchesQuery)) return 'doit sortir';
        // ⚠️ Quem decantou continua na tela — dentro da pastilha. Sem esta
        // linha a busca respondia «introuvable» para alguém que o sistema
        // sabe exatamente onde está, e a pessoa ao balcão concluiria que a
        // criança já não estava no refeitório.
        if (columns.decantados.some(matchesQuery)) return 'doit sortir';
        if (columns.dans.some(matchesQuery)) return 'dans la cantine';
        if (columns.sortis.some(matchesQuery)) return 'sortis';
        return 'introuvable';
    }, [query, columns]);

    /**
     * O × de uma linha.
     *
     * ⚠️ CONFIRMAÇÃO ANTES, e o texto diz o que acontece e o que NÃO acontece.
     * «Retirer» num ecrã de controlo de acesso soa a apagar a passagem, e não
     * é: o registo fica, o PPMS continua a contar a pessoa, o relatório não
     * muda. Sem essa frase o operador hesita — ou pior, não hesita e pensa que
     * apagou.
     *
     * ⚠️ ATUALIZAÇÃO OTIMISTA E DEPOIS A VERDADE DO SERVIDOR. O ciclo é de 3 s,
     * e uma linha que continuasse lá durante três segundos depois do clique
     * levaria o operador a carregar outra vez. O `setRetiradas` local mostra o
     * efeito já; a resposta do servidor substitui-o pelo que ficou gravado.
     * Se a chamada falhar, a linha VOLTA — e a pessoa vê que não funcionou,
     * em vez de acreditar que sim.
     */
    const retirarLinha = async (ev) => {
        if (!podeRetirar) return;
        const user = window.userCache?.byId(ev.userId);
        const nome = window.MagboIdentity.resolver({ pessoa: user, userId: ev.userId }, { lang: 'fr' }).nome;
        if (!confirm(t('cantina.retirar.confirma', { nome: nome }))) return;

        const otimista = { userId: ev.userId, pointId: ev.pointId, removidoEm: new Date().toISOString() };
        setRetiradas(anteriores => anteriores.concat([otimista]));
        try {
            const gravada = await window.api.removeCantineLine(ev.pointId, ev.userId, null);
            setRetiradas(anteriores => anteriores
                .filter(r => !(r.userId === ev.userId && r.pointId === ev.pointId))
                .concat([gravada && gravada.userId ? gravada : otimista]));
        } catch (e) {
            setRetiradas(anteriores => anteriores
                .filter(r => !(r.userId === ev.userId && r.pointId === ev.pointId)));
            alert(t('cantina.retirar.erro') + ' ' + (e && e.message ? e.message : ''));
        }
    };

    /** Devolve a linha à tela. Sem confirmação: mostrar a mais não faz mal. */
    const devolverLinha = async (r) => {
        if (!podeRetirar) return;
        setRetiradas(anteriores => anteriores
            .filter(x => !(x.userId === r.userId && x.pointId === r.pointId)));
        try {
            await window.api.undoCantineRemoval(r.pointId, r.userId);
        } catch (e) {
            setRetiradas(anteriores => anteriores.concat([r]));
            alert(t('cantina.retirar.erro') + ' ' + (e && e.message ? e.message : ''));
        }
    };

    const elapsedLabel = (ev) => {
        const mins = Math.floor((now - ev._t) / 60000);
        if (mins < 1) return t('cantina.agora');
        if (mins < 60) return `il y a ${mins} min`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `il y a ${h}h${m.toString().padStart(2, '0')}`;
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 animate-fade-in flex flex-col xl:flex-row gap-6 items-start">
            
            {/* Monitor Content (Main) */}
            <div className="flex-1 w-full space-y-5">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-navy-500 flex items-center justify-center">
                            <LucideIcon name="utensils" size={26} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-navy-500">{t('cantina.titulo')}</h2>
                            <p className="text-sm text-slate-400">{t('cantina.subtitulo')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { if (confirm(t('cantina.limpar.confirma'))) setCutoff(Date.now()); }}
                            className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-soft-100 hover:bg-soft-200 px-3 py-2 rounded-full transition-colors"
                            title={t('cantina.limpar.ajuda')}
                        >
                            <LucideIcon name="eraser" size={14} /> {t('cantina.limpar')}
                        </button>
                        <div className="flex items-center gap-2 text-xs font-semibold text-success-600 bg-success-50 px-3 py-2 rounded-full">
                            <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                            {lastUpdate ? t('vue.atualizado.as') + ' ' + formatTime(lastUpdate) : t('comum.conectando')}
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
                            <LucideIcon name="search" size={18} />
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={t('cantina.busca')}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-soft-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-300"
                        />
                    </div>
                    {query.trim() && (
                        <p className="text-xs font-semibold mt-2 px-1 text-slate-500">
                            {foundColumn === 'introuvable'
                                ? t('cantina.sem.pessoa')
                                : <>{t('cantina.achado.em')} <span className="text-accent-600">{foundColumn}</span></>}
                        </p>
                    )}
                </div>

                {/* ⚠️ Passagens antes da hora de abertura configurada.
                    NÃO é uma recusa e o texto diz isso: a passagem foi gravada
                    normalmente. O que a faixa afirma é sobre o SERVIÇO — a
                    cantina abriu mais cedo do que o horário configurado —, e é
                    quem está ao balcão que precisa de o saber, porque a fila
                    que ele está a ver não é a que o horário prevê. */}
                {columns.antesDaAbertura > 0 && (
                    <div className="flex items-start gap-2 text-xs text-warning-700 bg-warning-50 border border-warning-500/40 rounded-xl px-3 py-2">
                        <LucideIcon name="clock" size={14} className="mt-0.5 flex-shrink-0" />
                        <span>
                            <span className="font-bold">
                                {t('cantina.antes.abertura', { n: columns.antesDaAbertura, hora: cfg.lyceeInicio })}
                            </span>
                            {' '}
                            <span className="text-warning-600">{t('cantina.antes.abertura.ajuda')}</span>
                        </span>
                    </div>
                )}

                {/* ⚠️ AS RETIRADAS SÃO DITAS, não silenciosas. Uma linha que
                    some sem explicação é indistinguível de um defeito — e este
                    sistema já perdeu 95 entradas num dia sem ninguém reparar.
                    O contador abre a lista, e de lá cada uma pode voltar. */}
                {columns.retiradosDaVista > 0 && (
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 bg-soft-100 border border-soft-200 rounded-xl px-3 py-2">
                        <span className="flex items-center gap-1.5">
                            <LucideIcon name="eye-off" size={14} className="text-slate-400" />
                            {t('cantina.retiradas.aviso', { n: columns.retiradosDaVista })}
                        </span>
                        <CantineRetiradasIndicador
                            linhas={retiradas.filter(r =>
                                columns.chavesRetiradas.has(r.userId + '|' + (r.pointId || '')))}
                            podeDevolver={podeRetirar}
                            onDevolver={devolverLinha}
                            onAberto={setModalAberto} />
                    </div>
                )}

                {/* AS QUATRO FAMILIAS DO DIA, sempre a vista. Contam TODOS os
                    eventos de hoje (nao so os visiveis): um contador que so
                    visse a tela mentiria assim que uma linha decantasse.
                    Zero aparece — e a prova de que a pergunta foi feita. */}
                <div className="flex flex-wrap gap-2 text-xs">
                    <span className="font-bold px-2 py-1 rounded-lg bg-accent-50 text-accent-700 border border-accent-500/30">
                        {t('cantina.cont.avant', { n: columns.contadores.avantCreneau })}
                    </span>
                    <span className="font-bold px-2 py-1 rounded-lg bg-danger-50 text-danger-600 border border-danger-500/30">
                        {t('cantina.cont.apres', { n: columns.contadores.apresCreneau })}
                    </span>
                    <span className="font-bold px-2 py-1 rounded-lg bg-warning-50 text-warning-700 border border-warning-500/30">
                        {t('cantina.cont.curtas', { n: columns.contadores.curtas })}
                    </span>
                    {/* Âmbar como a coluna DOIT SORTIR, que trata o mesmo
                        fenomeno: a familia ACIONAVEL nao pode ter a cor da
                        familia historica arquivada ao lado. */}
                    <span className="font-bold px-2 py-1 rounded-lg bg-warning-100 text-warning-800 border border-warning-500/40">
                        {t('cantina.cont.longas', { n: columns.contadores.longas })}
                    </span>
                    {columns.contadores.foraLegado > 0 && (
                        <span className="px-2 py-1 rounded-lg bg-soft-100 text-slate-400 border border-soft-200"
                            title={t('cantina.cont.legado.ajuda')}>
                            {t('cantina.cont.legado', { n: columns.contadores.foraLegado })}
                        </span>
                    )}
                </div>

                {/* ⚠️ A ORDEM É DANS LA CANTINE · DOIT SORTIR · SORTIS, e ela
                    é a razão desta entrega. Ver o cabeçalho do ficheiro. */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Coluna 1 — quem está lá dentro agora */}
                    <div className="bg-soft-50/50 rounded-2xl p-3">
                        <CantineColumnHeader icon="log-in" title={t('cantina.col.dentro')} count={columns.dans.length} color="bg-accent-500" />
                        <div className="space-y-2">
                            {columns.dans.length === 0 && <p className="text-xs text-slate-300 text-center py-6">{t('cantina.col.vazio')}</p>}
                            {columns.dans.map(ev => <CantineCard key={ev.userId} ev={ev} variant="dans"
                                cfg={cfg} elapsedLabel={elapsedLabel} podeRetirar={podeRetirar}
                                onRetirar={retirarLinha} dim={!!query.trim() && !matchesQuery(ev)} />)}
                        </div>
                    </div>

                    {/* Coluna 2 — a única sobre a qual se AGE */}
                    <div className="bg-warning-50/40 rounded-2xl p-3 border border-warning-200">
                        <CantineColumnHeader icon="alert-triangle" title={t('cantina.col.deve.sair')}
                            count={columns.doitSortir.length + columns.decantados.length}
                            color="bg-warning-500"
                            extra={<CantineDecantadosIndicador
                                linhas={columns.decantados}
                                decantacaoMinutos={cfg.decantacaoMinutos}
                                elapsedLabel={elapsedLabel}
                                onAberto={setModalAberto} />} />
                        <div className="space-y-2">
                            {columns.doitSortir.length === 0 && <p className="text-xs text-slate-300 text-center py-6">{t('cantina.col.vazio')}</p>}
                            {columns.doitSortir.map(ev => <CantineCard key={ev.userId} ev={ev} variant="doit"
                                cfg={cfg} elapsedLabel={elapsedLabel} podeRetirar={podeRetirar}
                                onRetirar={retirarLinha} dim={!!query.trim() && !matchesQuery(ev)} />)}
                        </div>
                    </div>

                    {/* Coluna 3 — acabou; fica visível um pouco e some */}
                    <div className="bg-soft-50/50 rounded-2xl p-3">
                        <CantineColumnHeader icon="log-out" title={t('cantina.col.sairam')} count={columns.sortis.length} color="bg-success-500" />
                        <div className="space-y-2">
                            {columns.sortis.length === 0 && <p className="text-xs text-slate-300 text-center py-6">{t('cantina.col.vazio')}</p>}
                            {columns.sortis.map(ev => <CantineCard key={ev.userId} ev={ev} variant="sortis"
                                cfg={cfg} elapsedLabel={elapsedLabel} podeRetirar={podeRetirar}
                                onRetirar={retirarLinha} dim={!!query.trim() && !matchesQuery(ev)} />)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sidebar: Denied Attempts Feed */}
            <div className="w-full xl:w-96 flex-shrink-0 h-[600px] xl:h-[calc(100vh-120px)] xl:sticky xl:top-6">
                <DeniedAttemptsFeed 
                    title={t('feed.titulo')} 
                    emptyMessage={t('feed.vazio')} 
                    fetchFn={window.api?.getRefectoryAttempts || (async () => [])} 
                    pollingMs={3000} 
                />
            </div>

        </div>
    );
}
