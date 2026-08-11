// =====================================================================
// LISTA DE COLUNAS DE UMA IMPORTAÇÃO — obrigatórias em NEGRITO
// =====================================================================
// As telas de importação listavam as colunas como texto corrido, com tudo
// no mesmo peso. Quem monta a planilha não tinha como ver, de relance, o que
// PRECISA estar preenchido — descobria pelo erro, com o arquivo já pronto.
//
// Só apresentação: os dados vêm de js/utils/importColumns.js, e a regra de
// aceitação continua inteiramente no backend. Este componente não valida nada.

function ImportColumnList({ doc, legenda = true }) {
    if (!doc || !Array.isArray(doc.colunas)) return null;
    const M = window.MagboImportColumns;

    return (
        <div className="mt-2">
            <ul className="space-y-1">
                {doc.colunas.map(c => {
                    const obrigatoria = M.ehObrigatorio(c);
                    const condicional = M.ehCondicional(c);
                    return (
                        <li key={c.campo} className="text-xs flex flex-wrap items-baseline gap-x-1.5">
                            {/* O PESO DA FONTE É A INFORMAÇÃO. Obrigatória em
                                negrito e escura; opcional em peso normal e mais
                                clara — dá para ler sem passar pelas etiquetas. */}
                            <code className={`px-1.5 py-0.5 rounded ${obrigatoria
                                ? 'bg-soft-100 font-bold text-navy-600'
                                : 'bg-soft-50 font-normal text-slate-500'}`}>
                                {c.campo}
                            </code>
                            {obrigatoria && (
                                <span className="text-[10px] font-bold uppercase text-danger-600">obrigatória</span>
                            )}
                            {condicional && (
                                <span className="text-[10px] font-bold uppercase text-warning-600">
                                    {c.obrigatorio === 'conjunto' ? 'em conjunto' : 'condicional'}
                                </span>
                            )}
                            {c.aceitos && c.aceitos.length > 0 && (
                                <span className="text-slate-400">aceita: {c.aceitos.join(' · ')}</span>
                            )}
                            {c.nota && <span className="text-slate-400">— {c.nota}</span>}
                        </li>
                    );
                })}
            </ul>
            {legenda && (
                <p className="text-[11px] text-slate-400 mt-2">
                    Em <strong className="text-navy-600">negrito</strong>, o que precisa estar
                    preenchido em toda linha. O resto é opcional.
                    {doc.posicional && ' As colunas são lidas pela POSIÇÃO, não pelo nome.'}
                </p>
            )}
        </div>
    );
}
