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

    const totalPessoas = snap ? (snap.zonas || []).reduce((s, z) => s + (z.pessoas || []).length, 0) : 0;

    return (
        <div className="max-w-5xl mx-auto px-4 py-6 animate-fade-in" id="ppms-print">
            <style>{`@media print { body * { visibility: hidden; } #ppms-print, #ppms-print * { visibility: visible; } #ppms-print { position: absolute; left: 0; top: 0; width: 100%; } .ppms-nao-imprime { display: none; } }`}</style>

            <div className="flex items-center justify-between mb-4 ppms-nao-imprime">
                <div className="flex items-center gap-3">
                    <button onClick={onBack}
                        className="w-10 h-10 rounded-xl bg-white border border-soft-200 shadow-sm flex items-center justify-center">
                        <LucideIcon name="arrow-left" size={18} className="text-navy-500" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-navy-500">{t('ppms.titulo')}</h1>
                        <p className="text-xs text-slate-400">{t('ppms.subtitulo')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={carregar} disabled={carregando}
                        className="px-3 py-2 rounded-xl bg-accent-500 text-white text-sm font-bold disabled:opacity-50">
                        {t('ppms.atualizar')}
                    </button>
                    <button onClick={() => window.print()}
                        className="px-3 py-2 rounded-xl bg-soft-100 text-navy-500 text-sm font-bold">
                        {t('ppms.imprimir')}
                    </button>
                </div>
            </div>

            {/* ⚠️ Sem rede: a hora do retrato em destaque, nunca escondida. */}
            {offline && (
                <p className="text-sm font-bold text-warning-600 bg-warning-100 border-2 border-warning-500 rounded-xl px-4 py-3 mb-4">
                    {snap ? t('ppms.offline', { hora: carimbo(snap.geradoEm) }) : t('ppms.sem.relevo')}
                </p>
            )}

            {/* Os avisos ficam AQUI, antes do número. */}
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
                // Recusa NOMEADA — nunca a cara de "sem dados" nem a de "sem
                // rede". Quem precisa da lista numa evacuacao tem de saber que o
                // caminho e pedir a permissao, nao esperar o wifi voltar.
                <p className="text-sm font-bold text-danger-600 bg-danger-50 border-2 border-danger-500 rounded-xl px-4 py-6 text-center">
                    {t('ppms.sem.permissao')}
                </p>
            ) : carregando && !snap ? (
                <p className="text-sm text-slate-400 py-10 text-center">{t('ppms.carregando')}</p>
            ) : !snap ? (
                <p className="text-sm text-slate-400 py-10 text-center">{t('ppms.sem.relevo')}</p>
            ) : (
                <>
                    <div className="bg-navy-500 text-white rounded-2xl p-6 mb-5 text-center">
                        <p className="text-6xl font-black leading-none">{snap.totalDentro}</p>
                        <p className="text-sm font-semibold mt-2 opacity-90">{t('ppms.total')}</p>
                        <p className="text-xs opacity-60 mt-1">{t('ppms.gerado', { hora: carimbo(snap.geradoEm) })}</p>
                        {totalPessoas > 0 && (
                            <p className="text-xs opacity-75 mt-2">
                                {t('ppms.conferidos', { n: conferidos.size, total: totalPessoas })}
                            </p>
                        )}
                    </div>

                    {(snap.zonas || []).length === 0 ? (
                        <p className="text-sm text-slate-400 py-8 text-center">{t('ppms.vazio')}</p>
                    ) : (
                        <div className="space-y-5">
                            {snap.zonas.map(z => (
                                <div key={z.pointId} className="bg-white rounded-2xl border border-soft-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 bg-soft-50 border-b border-soft-200 flex items-center justify-between">
                                        <div className="min-w-0">
                                            {/* ⚠️ A zona sintética tem nome PRÓPRIO: dizer "CDI"
                                                para quem acabou de sair do CDI mandaria a equipe
                                                procurar numa sala vazia. */}
                                            <p className="font-black text-navy-500 truncate">
                                                {z.pointId === 'EM_TRANSITO'
                                                    ? t('ppms.zona.transito')
                                                    : pointLabel(z.pointId, window.MagboI18n.getLang())}
                                            </p>
                                            {z.pointId === 'EM_TRANSITO' && (
                                                <p className="text-[11px] text-slate-400">{t('ppms.zona.transito.ajuda')}</p>
                                            )}
                                        </div>
                                        <span className="text-lg font-black text-navy-500">{z.total}</span>
                                    </div>
                                    <div>
                                        {(z.pessoas || []).map(p => {
                                            const feito = conferidos.has(p.id);
                                            return (
                                                <button key={p.id} onClick={() => alternar(p.id)}
                                                    className={`w-full text-left px-5 py-3 border-b border-soft-100 last:border-0 flex items-center gap-3 transition-colors ${feito ? 'bg-success-50' : 'hover:bg-soft-50'}`}>
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${feito ? 'bg-success-500 text-white' : 'bg-soft-200'}`}>
                                                        {feito && <LucideIcon name="check" size={14} />}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        {/* Nome GRANDE: alguém lê isto em voz alta. */}
                                                        <span className={`block text-lg font-bold truncate ${feito ? 'text-slate-400 line-through' : 'text-navy-500'}`}>
                                                            {p.nome}
                                                        </span>
                                                        <span className="block text-xs text-slate-400">
                                                            {p.turma || '—'} · {p.id} · {t('ppms.visto.as', { hora: hora(p.ultimaHora) })}
                                                            {z.pointId === 'EM_TRANSITO' && p.ultimoPonto
                                                                ? ' · ' + pointLabel(p.ultimoPonto, window.MagboI18n.getLang())
                                                                : ''}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
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
