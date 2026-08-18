// =====================================================================
// MOVIMENTOS INCOMPLETOS — o "quais" de um número que já existia
// =====================================================================
// O card "Sorties non enregistrées" do painel diz QUANTOS são. Ninguém vai
// procurar uma criança com um número na mão: a Vie Scolaire precisa do NOME, da
// HORA e do PONTO. Esta tela é isso, e nada além disso.
//
// ⚠️ O CONTADOR NÃO MUDA. Ele continua exatamente onde estava, contando
// exatamente o que contava. Esta lista é a mesma pergunta com outra projeção —
// o backend garante isso com o WHERE literalmente copiado, e há um guarda de
// string que quebra se os dois divergirem. Se algum dia o card disser 7 e a
// lista trouxer 5, ninguém saberá qual dos dois está certo, e a resposta
// racional passa a ser não usar nenhum dos dois.
//
// ⚠️ E ELA NÃO ACUSA NINGUÉM. "Não vi" é NÃO SEI, nunca "não esteve". Esta
// frase não é enfeite de rodapé: ela está no topo da tela, em destaque, porque
// na segunda vez que alguém for nomeado errado ninguém abre esta tela de novo —
// e aí ela deixa de servir justamente no dia em que importaria.
//
// Duas espécies, nunca somadas num número só:
//   ENTREE_SANS_SORTIE  entrou e a saída nunca foi registrada  (5.348 na base real)
//   SORTIE_SANS_ENTREE  saiu sem entrada registrada antes      (ZERO na base real)
//
// ⚠️ A segunda é uma SENTINELA, e o zero é o ponto. Medido em 15/08/2026 sobre
// as 439.993 passagens reais: nunca aconteceu, nem uma vez. O dia em que ela
// deixar de ser zero é o dia em que um leitor foi trocado de sentido ou um
// door_mapping foi gravado errado — e é bom que alguém veja.

function MouvementsIncomplets({ movimentos, carregando, erro, onFechar }) {
    const t = useI18n();
    const lang = useLocale ? useLocale() : 'fr';

    const porTipo = React.useMemo(() => {
        const m = { ENTREE_SANS_SORTIE: [], SORTIE_SANS_ENTREE: [] };
        (movimentos || []).forEach(x => { if (m[x.tipo]) m[x.tipo].push(x); });
        return m;
    }, [movimentos]);

    const grupo = (tipo, cls) => {
        const linhas = porTipo[tipo];
        if (!linhas.length) return null;
        return (
            <div className="mb-4" key={tipo}>
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
                        {linhas.length}
                    </span>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                        {t('incompletos.tipo.' + tipo)}
                    </p>
                </div>
                <p className="text-[11px] text-slate-500 mb-2 pl-1">
                    {t(linhas[0].explicacao)}
                </p>
                <div className="space-y-1.5">
                    {linhas.map((l, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-soft-200">
                            {/* Sem nome resolvido a matrícula é o que há — e a
                                tela diz que é isso, em vez de mostrar um id
                                cru que parece um defeito. */}
                            <span className="font-bold text-sm text-navy-500 truncate">
                                {l.nome || (
                                    <span className="font-mono text-slate-500">
                                        {l.userId} <span className="font-sans text-[11px]">({t('incompletos.sem.nome')})</span>
                                    </span>
                                )}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{l.turma}</span>
                            {/* pointLabel (js/data/constants.js) — nome do
                                ponto, nunca o código seco: "ENFERM" não diz
                                nada a quem lê a tela às pressas. */}
                            <span className="text-xs text-slate-500 shrink-0 flex-1">
                                {pointLabel(l.pointId, lang)}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{l.date}</span>
                            <span className="text-xs text-slate-600 font-mono shrink-0">{l.hora}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-soft-50 rounded-2xl border border-soft-200 p-4 mt-3">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <p className="font-bold text-navy-500 text-sm">{t('incompletos.titulo')}</p>
                    <p className="text-xs text-slate-500">{t('incompletos.subtitulo')}</p>
                </div>
                {onFechar && (
                    <button type="button" onClick={onFechar}
                        className="text-xs font-bold text-slate-500 hover:text-navy-500 shrink-0">
                        {t('incompletos.fechar')}
                    </button>
                )}
            </div>

            {/* ⚠️ NO TOPO, sempre visível — não é rodapé. */}
            <p className="text-xs text-warning-600 bg-warning-50 border border-warning-500/40 rounded-xl px-3 py-2 mb-4">
                {t('incompletos.aviso')}
            </p>

            {erro ? (
                <p className="text-sm text-danger-600 py-4 text-center">{erro}</p>
            ) : carregando ? (
                <p className="text-sm text-slate-400 py-6 text-center">{t('comum.carregando')}</p>
            ) : !(movimentos || []).length ? (
                <div className="flex items-center gap-2 text-success-600 text-sm py-4">
                    <LucideIcon name="check-circle-2" size={16} className="text-success-500" />
                    {t('incompletos.vazio')}
                </div>
            ) : (
                <>
                    {grupo('ENTREE_SANS_SORTIE', 'bg-warning-100 text-warning-600')}
                    {grupo('SORTIE_SANS_ENTREE', 'bg-danger-100 text-danger-600')}
                </>
            )}
        </div>
    );
}
