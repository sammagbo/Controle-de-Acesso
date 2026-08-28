// =====================================================================
// PPMS — "quem está dentro, agora"
// =====================================================================
// Desenhada para o dia em que importa, não para a demonstração.
//
// O Plan Particulier de Mise en Sûreté é obrigatório e a contagem hoje é feita
// em papel, nas "fiches des effectifs" do kit de confinamento. Esta tela é o que
// alguém abre no telefone, no pátio, com o pátio cheio.
//
// ⚠️ TRÊS DECISÕES QUE VÊM DAÍ:
//
// 1. O RETRATO É GUARDADO no localStorage a cada carga boa. Numa emergência a
//    rede é a primeira coisa que cai — e uma tela que mostra um erro quando a
//    rede some é uma tela inútil exatamente na hora para a qual foi feita. Sem
//    rede, mostra o último retrato COM a hora dele, em destaque, para ninguém
//    confundir dado velho com dado de agora.
// 2. O NOME É GRANDE e o toque marca como conferido. Quem lê em voz alta precisa
//    achar a próxima linha sem procurar, e precisa saber onde parou.
// 3. OS AVISOS FICAM NO TOPO, não num rodapé. "Segundo os leitores" não é
//    ressalva jurídica: é a diferença entre parar de procurar uma criança e
//    continuar procurando.

// ⚠️ TONS: success/danger/warning só existem em 50, 100, 500 e 600 no
// tailwind.config inline do index.html. O aviso de OFFLINE — o elemento que diz
// «este retrato é velho», e que o comentário acima chama da diferença entre
// continuar procurando uma criança e parar — usava `text-warning-800` e
// `border-warning-400`: nenhum dos dois é gerado, então ele saía com a cor
// herdada, indistinguível do resto da tela. Apanhado pelo agente de qualidade
// em 14/08/2026.

// ⚠️ A chave e as regras de apagar vivem em js/utils/ppmsCache.js, onde
// elas TÊM teste. Estavam duplicadas como literal aqui e no auth.js.
const PPMS_CACHE = window.MagboPpmsCache.CHAVE;

function PpmsView({ onBack }) {
    const t = useI18n();
    const locale = useLocale();
    const { useState, useEffect, useCallback } = React;

    const [snap, setSnap] = useState(null);
    const [offline, setOffline] = useState(false);
    const [carregando, setCarregando] = useState(true);
    // 403/401: recusa de PERMISSAO, nunca tratada como rede caida.
    const [semPermissao, setSemPermissao] = useState(false);
    const [conferidos, setConferidos] = useState(() => new Set());

    /**
     * Lê o último retrato guardado — e DESCARTA o que não é de hoje.
     *
     * ⚠️ São nomes, matrículas e turmas de menores em disco. Duas razões, e
     * qualquer uma bastaria:
     *  • Retenção: este projeto decidiu por escrito não guardar nem o token em
     *    localStorage. Uma lista nominativa sem prazo é pior.
     *  • Evacuação: um retrato de sexta não ajuda a evacuar na terça. Mostrar
     *    data ajuda; recusar é o que impede alguém de riscar um nome e parar de
     *    procurar uma criança.
     * O que passa da meia-noite é apagado do disco, não só ignorado.
     */
    const doCache = () => {
        try {
            const g = localStorage.getItem(PPMS_CACHE);
            if (!g) return null;
            const d = JSON.parse(g);
            // ⚠️ hojeNaEscola(), nunca toISOString(): o segundo é UTC e
            // apagaria o retrato do próprio dia depois das 21h BRT.
            const hoje = window.MagboPpmsCache.hojeNaEscola();
            const servivel = window.MagboPpmsCache.aindaServe(d, hoje);
            if (!servivel) { window.MagboPpmsCache.apagar(); return null; }
            return servivel;
        } catch (e) {
            localStorage.removeItem(PPMS_CACHE);
            return null;
        }
    };

    const carregar = useCallback(async () => {
        // ⚠️ PINTA O CACHE PRIMEIRO, sempre. Rede CAÍDA falha rápido e a tela se
        // salva sozinha; rede DEGRADADA — que é o caso normal num incidente —
        // deixaria o fetch pendurado dezenas de segundos com um retrato bom
        // guardado que a tela se recusava a mostrar. Cache-só-no-fracasso é
        // cache que não serve quando o fracasso demora.
        const guardado = doCache();
        if (guardado) { setSnap(guardado); setOffline(true); }
        setCarregando(true);

        // ⚠️ E com TETO. `fetch` sem AbortController espera o que o sistema
        // operacional quiser esperar; numa evacuação, seis segundos é o limite
        // do que alguém encara olhando para um telefone.
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        try {
            const res = await fetch(`${window.magboConfig?.getCached?.()?.apiUrl || 'http://localhost:8080'}/api/ppms/inside`, {
                headers: window.authHeaders ? window.authHeaders() : {},
                signal: ctrl.signal
            });
            // ⚠️ 403/401 ANTES do throw generico. O catch abaixo e o caminho da
            // REDE — ele pinta o retrato do localStorage, que e o comportamento
            // certo numa evacuacao com wifi caido. Mas o 403 nao e wifi caido:
            // e o servidor dizendo "este login nao pode ver esta lista". A
            // primeira versao deixava o 403 cair no mesmo catch, e a tela
            // servia nome, matricula e turma de menores, do cache em disco,
            // para quem o servidor tinha acabado de recusar — e o cache de um
            // login sem direito ainda ficava no aparelho. Painel de revisao
            // (seguranca/RGPD, 14/08).
            if (window.MagboPpmsCache.recusaDePermissao(res.status)) {
                window.MagboPpmsCache.apagar();
                setSnap(null);
                setSemPermissao(true);
                setOffline(false);
                return;
            }
            if (!res.ok) throw new Error('http ' + res.status);
            setSemPermissao(false);
            const dados = await res.json();
            setSnap(dados);
            setOffline(false);
            try { localStorage.setItem(PPMS_CACHE, JSON.stringify(dados)); } catch (e) { /* cota cheia: segue */ }
        } catch (e) {
            // Já está pintado o cache (se havia); só confirma o estado.
            setSnap(prev => prev || doCache());
            setOffline(true);
        } finally {
            clearTimeout(tid);
            setCarregando(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const hora = (iso) => iso ? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—';

    /**
     * Carimbo do RETRATO — com DIA quando não é de hoje.
     *
     * ⚠️ O cache do localStorage não expira. Sem a data, abrir o PPMS às 8h de
     * uma terça sem rede mostrava "Retrato das 16:45" — de ontem — com nada
     * indicando isso. É exatamente a confusão que esta tela existe para evitar,
     * e numa evacuação ela faz alguém parar de procurar uma criança.
     */
    const carimbo = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        const hoje = new Date().toDateString() === d.toDateString();
        return hoje ? hora(iso) : d.toLocaleDateString(locale) + ' ' + hora(iso);
    };

    const alternar = (id) => setConferidos(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    // ⚠️ NÃO HÁ EXPORTAÇÃO CSV, e a ausência é a decisão.
    //
    // O PPMS exige contagem em PAPEL para a cellule de crise, e é isso que a
    // mallette guarda — por isso o botão IMPRIMIR fica. Uma folha impressa é
    // usada e descartada; um CSV com nome, matrícula e turma de todas as
    // crianças da escola fica no laptop de alguém para sempre. Este projeto
    // trata exportação em massa como decisão do dono e não como efeito
    // colateral de uma feature (precedente: F7b congelada; as fotos têm teste
    // que quebra se alguém criar rota de exportação em massa).
    //
    // Veto do agente de proteção de dados, mantido pelo dono em 14/08/2026.

    // ⚠️ OS TOTAIS VEM DO SERVIDOR (`z.total`, `g.total`), nunca de
    // `pessoas.length`. Hoje os dois coincidem — nada e truncado —, mas
    // "hoje coincidem" e uma coincidencia, nao um contrato: no dia em que
    // alguem paginar a lista para nao mandar 300 nomes de uma vez, contar o
    // comprimento diria "12 eleves" onde ha 200, sem erro nenhum, numa
    // evacuacao. Ver PpmsSnapshot.Zona.grupos.
    const totalPessoas = snap ? (snap.zonas || []).reduce((acc, z) => acc + (z.total || 0), 0) : 0;

    // Zonas abertas. Comeca VAZIO: a tela abre na lista de zonas, que e a
    // pergunta do patio ("onde ainda ha gente?"), nao numa parede de nomes.
    const [abertas, setAbertas] = useState(() => new Set());
    const alternarZona = (id) => setAbertas(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });
    const zonasComGente = (snap ? (snap.zonas || []) : []).filter(z => (z.total || 0) > 0);
    const todasAbertas = zonasComGente.length > 0 && zonasComGente.every(z => abertas.has(z.pointId));
    const alternarTodas = () => setAbertas(todasAbertas ? new Set() : new Set(zonasComGente.map(z => z.pointId)));

    /** Rotulo de um grupo. Codigo cru se o tipo for novo — nunca a chave i18n. */
    const rotuloGrupo = (tipo) => {
        const k = 'ppms.grupo.' + tipo;
        const v = t(k);
        return v === k ? tipo : v;
    };

    const nomeDaZona = (z) => z.pointId === 'EM_TRANSITO'
        ? t('ppms.zona.transito')
        : pointLabel(z.pointId, window.MagboI18n.getLang());

    /** As pessoas de uma zona, na ordem dos grupos que o SERVIDOR mandou. */
    const porGrupo = (z) => {
        const pessoas = z.pessoas || [];
        return (z.grupos || []).map(g => ({
            tipo: g.tipo,
            total: g.total,
            pessoas: pessoas.filter(p => (p.tipo || 'OUTRO') === g.tipo)
        }));
    };

    const linhaPessoa = (p, z) => {
        const feito = conferidos.has(p.id);
        // Hora de ENTRADA quando ha evento de portao; senao a ultima vez vista.
        const quando = p.entrouAs
            ? t('ppms.entrou.as', { hora: hora(p.entrouAs) })
            : t('ppms.visto.as', { hora: hora(p.ultimaHora) });
        return (
            <button key={p.id} onClick={() => alternar(p.id)}
                className={`w-full text-left px-4 py-3 min-h-[60px] border-b border-soft-100 last:border-0 flex items-center gap-3 transition-colors ${feito ? 'bg-success-50' : 'active:bg-soft-100'}`}>
                {/* Alvo de toque grande: um polegar, de pe, no patio. */}
                <span className={`ppms-marca w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${feito ? 'bg-success-500 text-white' : 'bg-soft-200'}`}>
                    {feito && <LucideIcon name="check" size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className={`block text-lg font-bold leading-tight ${feito ? 'text-slate-400 line-through' : 'text-navy-500'}`}>
                        {p.nome}
                    </span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                        {p.turma ? p.turma + ' · ' : ''}{p.id} · {quando}
                        {z.pointId === 'EM_TRANSITO' && p.ultimoPonto
                            ? ' · ' + pointLabel(p.ultimoPonto, window.MagboI18n.getLang())
                            : ''}
                    </span>
                </span>
            </button>
        );
    };

    return (
        <div className="max-w-3xl mx-auto px-3 py-5 animate-fade-in" id="ppms-print">
            {/* ⚠️ A IMPRESSAO ABRE TUDO, sempre — o papel vai para a cellule
                de crise e e lido por quem nunca viu a tela. As zonas fechadas
                sao escondidas por CSS (`.ppms-replie`), NUNCA desmontadas: um
                `display:none` o print reabre, um componente que nao foi
                renderizado o print nao inventa. Nada de expandir-tudo por JS
                antes de `window.print()` — o dialogo abre antes do React pintar. */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #ppms-print, #ppms-print * { visibility: visible; }
                    #ppms-print { position: absolute; left: 0; top: 0; width: 100%; }
                    /* ⚠️ No papel a pastilha de "conferido" vira uma CAIXA VAZIA:
                       a folha da mallette e riscada A CANETA enquanto se conta.
                       Um circulo cinzento cheio so gasta tinta e nao se risca. */
                    .ppms-marca { background: #fff !important; border: 1.5px solid #64748b !important;
                                  border-radius: 3px !important; }
                    .ppms-nao-imprime { display: none !important; }
                    .ppms-replie { display: block !important; }
                    .ppms-so-impressao { display: block !important; }
                    .ppms-zona { break-inside: avoid; page-break-inside: avoid; }
                    .ppms-grupo { break-inside: avoid; page-break-inside: avoid; }
                }
                .ppms-so-impressao { display: none; }
            `}</style>

            <div className="flex items-center justify-between gap-2 mb-4 ppms-nao-imprime">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={onBack} aria-label={t('header.dashboard')}
                        className="w-12 h-12 rounded-xl bg-white border border-soft-200 shadow-sm flex items-center justify-center shrink-0">
                        <LucideIcon name="arrow-left" size={20} className="text-navy-500" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-navy-500 truncate">{t('ppms.titulo')}</h1>
                        <p className="text-xs text-slate-400 truncate">{t('ppms.subtitulo')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={carregar} disabled={carregando}
                        className="h-12 px-4 rounded-xl bg-accent-500 text-white text-sm font-bold disabled:opacity-50">
                        {t('ppms.atualizar')}
                    </button>
                    <button onClick={() => window.print()}
                        className="h-12 px-4 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold">
                        {t('ppms.imprimir')}
                    </button>
                </div>
            </div>

            {/* Sem rede: a hora do retrato em destaque, nunca escondida. */}
            {offline && (
                <p className="text-sm font-bold text-warning-600 bg-warning-100 border-2 border-warning-500 rounded-xl px-4 py-3 mb-4">
                    {snap ? t('ppms.offline', { hora: carimbo(snap.geradoEm) }) : t('ppms.sem.relevo')}
                </p>
            )}

            {/* Os avisos ficam AQUI, antes do numero — e tambem no papel. */}
            {snap && (snap.avisos || []).length > 0 && (
                <div className="mb-4 space-y-1">
                    {snap.avisos.map(a => (
                        <p key={a} className="text-xs text-slate-600 bg-soft-100 border border-soft-200 rounded-lg px-3 py-2">
                            {t(a)}
                        </p>
                    ))}
                </div>
            )}

            {semPermissao ? (
                <p className="text-sm font-bold text-danger-600 bg-danger-50 border-2 border-danger-500 rounded-xl px-4 py-6 text-center">
                    {t('ppms.sem.permissao')}
                </p>
            ) : carregando && !snap ? (
                <p className="text-sm text-slate-400 py-10 text-center">{t('ppms.carregando')}</p>
            ) : !snap ? (
                <p className="text-sm text-slate-400 py-10 text-center">{t('ppms.sem.relevo')}</p>
            ) : (
                <>
                    <div className="bg-navy-500 text-white rounded-2xl p-5 mb-4 text-center ppms-zona">
                        <p className="text-6xl font-black leading-none">{snap.totalDentro}</p>
                        <p className="text-sm font-semibold mt-2 opacity-90">{t('ppms.total')}</p>
                        <p className="text-xs opacity-70 mt-1">{t('ppms.gerado', { hora: carimbo(snap.geradoEm) })}</p>
                        {totalPessoas > 0 && (
                            <p className="text-xs opacity-75 mt-2 ppms-nao-imprime">
                                {t('ppms.conferidos', { n: conferidos.size, total: totalPessoas })}
                            </p>
                        )}
                    </div>

                    {zonasComGente.length > 0 && (
                        <div className="flex justify-end mb-2 ppms-nao-imprime">
                            <button onClick={alternarTodas}
                                className="h-10 px-3 rounded-lg bg-white border border-soft-200 text-xs font-bold text-navy-500">
                                {todasAbertas ? t('ppms.tout.fermer') : t('ppms.tout.ouvrir')}
                            </button>
                        </div>
                    )}

                    <div className="space-y-3">
                        {(snap.zonas || []).map(z => {
                            const vazia = (z.total || 0) === 0;
                            const aberta = abertas.has(z.pointId);
                            return (
                                <div key={z.pointId} className="ppms-zona bg-white rounded-2xl border border-soft-200 shadow-sm overflow-hidden">
                                    {/* ⚠️ O CABECALHO INTEIRO E O BOTAO — 64px de altura,
                                        um polegar de pe. Nada aqui depende de hover. */}
                                    <button
                                        onClick={() => !vazia && alternarZona(z.pointId)}
                                        disabled={vazia}
                                        aria-expanded={aberta}
                                        className={`w-full text-left px-4 py-3 min-h-[64px] flex items-center gap-3 ${vazia ? 'bg-soft-50/60' : 'bg-soft-50 active:bg-soft-100'}`}>
                                        <span className="min-w-0 flex-1">
                                            {/* ⚠️ QUEBRA, nao trunca. Com `truncate` num telefone de
                                                390px o nome da zona maior saia como
                                                «Dans l'établissement — z…» — e e a zona onde estao
                                                202 das 208 pessoas. Um nome cortado numa tela de
                                                evacuacao e pior que uma linha a mais. */}
                                            <span className={`block font-black leading-tight ${vazia ? 'text-slate-400' : 'text-navy-500'}`}>
                                                {nomeDaZona(z)}
                                            </span>
                                            {/* A REPARTICAO POR TIPO, sem um clique. Numa
                                                evacuacao a primeira pergunta e "quantos
                                                alunos", nunca "quantas pessoas". */}
                                            {vazia ? (
                                                <span className="block text-[11px] text-slate-400 mt-0.5">{t('ppms.zona.vide')}</span>
                                            ) : (
                                                <span className="block text-[11px] text-slate-500 mt-0.5 truncate">
                                                    {(z.grupos || []).map(g => rotuloGrupo(g.tipo) + ' ' + g.total).join(' · ')}
                                                </span>
                                            )}
                                            {z.pointId === 'EM_TRANSITO' && (
                                                <span className="block text-[11px] text-slate-400 mt-0.5">{t('ppms.zona.transito.ajuda')}</span>
                                            )}
                                        </span>
                                        <span className={`text-3xl font-black tabular-nums ${vazia ? 'text-slate-500' : 'text-navy-500'}`}>
                                            {z.total || 0}
                                        </span>
                                        {!vazia && (
                                            <LucideIcon name={aberta ? 'chevron-up' : 'chevron-down'} size={20}
                                                className="text-slate-400 shrink-0 ppms-nao-imprime" />
                                        )}
                                    </button>

                                    {!vazia && (
                                        <div className={aberta ? '' : 'ppms-replie hidden'}>
                                            {porGrupo(z).map(g => (
                                                <div key={g.tipo} className="ppms-grupo">
                                                    {/* Cabecalho de GRUPO: rotulo + contagem do servidor. */}
                                                    <div className="px-4 py-2 bg-navy-500/5 border-y border-soft-200 flex items-center justify-between">
                                                        <span className="text-[11px] font-black uppercase tracking-wider text-navy-500">
                                                            {rotuloGrupo(g.tipo)}
                                                        </span>
                                                        <span className="text-sm font-black text-navy-500 tabular-nums">{g.total}</span>
                                                    </div>
                                                    {g.tipo === 'OUTRO' && (
                                                        <p className="px-4 py-2 text-[11px] text-warning-600 bg-warning-50">
                                                            {t('ppms.grupo.OUTRO.ajuda')}
                                                        </p>
                                                    )}
                                                    {g.pessoas.map(pe => linhaPessoa(pe, z))}
                                                </div>
                                            ))}
                                            {/* So no papel: o total da zona repetido no fim,
                                                para quem conta a folha sem ver o cabecalho. */}
                                            <p className="ppms-so-impressao px-4 py-2 text-xs font-bold text-navy-500 border-t border-soft-200">
                                                {t('ppms.imprime.zona.total', { n: z.total || 0 })}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Rodape do PAPEL: a regra fica com a folha, nao so com a tela. */}
                    <p className="ppms-so-impressao mt-4 pt-2 border-t border-soft-300 text-[11px] text-slate-600">
                        {t('ppms.imprime.rodape')}
                    </p>
                </>
            )}
        </div>
    );
}
