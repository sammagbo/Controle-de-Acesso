// =====================================================================
// O VEREDICTO DO REGIME, COMO O AED O LÊ NO PORTÃO
// =====================================================================
// ⚠️ QUATRO LEITURAS, e as duas do meio são as que decidem se esta tela serve.
//
// No dia 1, INCONNU domina (923 alunos sem regime) e A_VERIFIER é metade dos
// casos duvidosos (o MAGBO não tem a grade horária). Nenhum dos dois pode
// parecer recusa — barraria criança que pode sair — e nenhum pode parecer
// aprovação — soltaria criança que não pode. Por isso:
//
//   AUTORISE      verde    o regime anual autoriza
//   NON_AUTORISE  vermelho regime 1 no meio da jornada
//   A_VERIFIER    âmbar    falta a grade: CONFIRA, não é nem sim nem não
//   INCONNU       ardósia  não há regime: faça como antes, pelo carnet
//
// ⚠️ Ardósia e NÃO cinza-claro: o cinza-claro é a cor de MISSING_DOOR_MAPPING
// no feed de negadas, que o operador aprendeu a ler como "coisa de
// configuração". Este cinza tem borda e peso — é informação, não ruído.
//
// ⚠️ CADA VEREDICTO TRAZ A AÇÃO. Um rótulo que diz "à vérifier" sem dizer o
// que verificar devolve o AED à memória, que é o problema que este módulo
// existe para resolver.

const REGIME_VISUAL = {
    AUTORISE: {
        caixa: 'bg-success-50 border-success-500 text-success-700',
        pastilha: 'bg-success-100 text-success-700',
        icone: 'check-circle-2'
    },
    NON_AUTORISE: {
        caixa: 'bg-danger-50 border-danger-500 text-danger-700',
        pastilha: 'bg-danger-100 text-danger-700',
        icone: 'shield-alert'
    },
    A_VERIFIER: {
        caixa: 'bg-warning-50 border-warning-500 text-warning-700',
        pastilha: 'bg-warning-100 text-warning-700',
        icone: 'help-circle'
    },
    INCONNU: {
        caixa: 'bg-slate-50 border-slate-400 text-slate-700',
        pastilha: 'bg-slate-200 text-slate-700',
        icone: 'file-question'
    }
};

/** A pastilha curta, para a linha da lista. */
function RegimeChip({ verdict, regimeSortie }) {
    const t = useI18n();
    const v = REGIME_VISUAL[verdict];
    if (!v) return null;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${v.pastilha}`}>
            <LucideIcon name={v.icone} size={11} />
            {regimeSortie
                ? window.MagboI18n.tEnum('regimeSortie.curto', regimeSortie)
                : t('regime.verdict.' + verdict)}
        </span>
    );
}

/**
 * A FAIXA da última passagem — o que o AED lê sem procurar.
 *
 * Grande de propósito: com duzentos alunos em movimento, quem está no portão
 * não varre uma lista. Ele olha para cima uma vez.
 */
function RegimeVerdictBanner({ v }) {
    const t = useI18n();
    const locale = useLocale();
    if (!v) return null;
    const vis = REGIME_VISUAL[v.verdict];
    if (!vis) return null;

    const hora = v.momento
        ? new Date(v.momento).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <div className={`rounded-2xl border-2 px-4 py-3 mb-3 ${vis.caixa}`}>
            <div className="flex items-start gap-3">
                <LucideIcon name={vis.icone} size={26} className="shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                    <p className="text-lg font-black leading-tight truncate">
                        {t('regime.verdict.' + v.verdict)}
                    </p>
                    <p className="text-sm font-bold truncate">
                        {v.nome}{v.turma ? ' · ' + v.turma : ''}{hora ? ' · ' + hora : ''}
                    </p>
                    {/* O MOTIVO: por que o sistema disse isso. */}
                    <p className="text-xs mt-1 opacity-90">{t(v.motivo)}</p>
                    {/* A AÇÃO: o que fazer agora. Sem ela o rótulo é um enigma. */}
                    <p className="text-xs font-bold mt-1">{t('regime.acao.' + v.verdict)}</p>
                    {/* ⚠️ A RESSALVA. O verde responde "o regime autoriza", não
                        "conferi o horário" — o MAGBO não tem a grade. Uma
                        afirmação mais forte que o dado é o que a direção paga
                        depois. */}
                    {v.dependeDeGrade && (
                        <p className="text-[11px] mt-1 italic opacity-80">{t('regime.ressalva.grade')}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
