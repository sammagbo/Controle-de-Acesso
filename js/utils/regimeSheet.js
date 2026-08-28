// =====================================================================
// A PLANILHA DE REGIMES — nomes de coluna aceitos, num lugar só
// =====================================================================
// Espelha js/utils/mealSheet.js, que já resolveu o mesmo problema para os
// direitos de refeição. Aqui a planilha vem da Vie Scolaire com os carnets na
// mão, turma por turma.
//
// ⚠️ O PRONOTE NÃO TRAZ O REGIME. Verificado no PronoteSyncService: o CSV tem
// oito colunas obrigatórias (userId;nome;tipo;turma;responsavelId;
// responsavelNome;parentesco;telefone) e quatro opcionais do segundo
// responsável — nenhuma de régime général ou de sortie. O import de Excel de
// alunos também não. O caminho barato foi procurado e não existe; esta planilha
// é o caminho.
//
// ⚠️ Os nomes aceitos vêm em francês E português porque a lista chega ora de um,
// ora de outro — e também com o nome do campo do sistema, para um arquivo
// exportado do próprio MAGBO voltar sem tradução.

(function (root, factory) {
    const api = factory(root ? root.MagboHikSheet : null);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboRegimeSheet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (hik) {

    /** Cabeçalho na primeira linha — planilha da Vie Scolaire, não export de sistema. */
    const HEADER_ROW_INDEX = 0;

    /** Linha da planilha do primeiro registro (cabeçalho na 1). */
    const FIRST_DATA_ROW = 2;

    const COLUNAS = {
        matricula: ['Matrícula', 'Matricula', 'Matricule', 'ID', 'userId'],
        regimeGeneral: ['Régime général', 'Regime geral', 'Régime general', 'Regime', 'regimeGeneral'],
        regimeSortie: ['Régime de sortie', 'Regime de saída', 'Regime de saida', 'Sortie', 'regimeSortie'],
        validFrom: ['Valable du', 'Válido de', 'Valido de', 'validFrom'],
        validUntil: ['Valable au', 'Válido até', 'Valido ate', 'validUntil'],
        authorizedByFamily: ['Autorisé par', 'Autorizado por', 'Responsável', 'Responsavel', 'authorizedByFamily'],
        documentoRef: ['Document', 'Documento', 'Carnet', 'documentoRef'],
        assinadoEm: ['Signé le', 'Assinado em', 'assinadoEm'],
        note: ['Note', 'Observação', 'Observacao', 'Remarque']
    };

    /** Opções de leitura do xlsx — um só lugar para não divergirem. */
    function sheetOptions() {
        // ⚠️ raw:false = TUDO como texto. A matrícula tem zeros à esquerda
        // (0001764) e o xlsx a converteria em número, comendo o zero — e 1764 é
        // outro aluno. O backend recusa a linha como CONFLITO em vez de
        // adivinhar, mas ler como texto evita o problema na origem.
        return { range: HEADER_ROW_INDEX, defval: '', raw: false };
    }

    function mapRows(json) {
        return (Array.isArray(json) ? json : [])
            .map(function (row, i) {
                return {
                    linha: FIRST_DATA_ROW + i,
                    matricula: hik.col(row, COLUNAS.matricula),
                    regimeGeneral: hik.col(row, COLUNAS.regimeGeneral),
                    regimeSortie: hik.col(row, COLUNAS.regimeSortie),
                    validFrom: hik.col(row, COLUNAS.validFrom),
                    validUntil: hik.col(row, COLUNAS.validUntil),
                    authorizedByFamily: hik.col(row, COLUNAS.authorizedByFamily),
                    documentoRef: hik.col(row, COLUNAS.documentoRef),
                    assinadoEm: hik.col(row, COLUNAS.assinadoEm),
                    note: hik.col(row, COLUNAS.note)
                };
            })
            // Linha totalmente vazia é separador ou rodapé. Linha com ALGO mas
            // sem matrícula CONTINUA: quem a reporta é o backend, com o motivo
            // escrito, em vez de ela sumir em silêncio.
            .filter(function (r) {
                return r.matricula !== '' || r.regimeSortie !== '' || r.regimeGeneral !== '';
            });
    }

    /** Texto dos nomes aceitos, para a tela documentar sem duplicar a lista. */
    function documentacaoDeColunas() {
        return [
            { campo: 'Matricule', obrigatorio: true, aceitos: COLUNAS.matricula },
            { campo: 'Régime général', obrigatorio: true, aceitos: COLUNAS.regimeGeneral },
            { campo: 'Régime de sortie', obrigatorio: true, aceitos: COLUNAS.regimeSortie },
            { campo: 'Valable du', obrigatorio: true, aceitos: COLUNAS.validFrom },
            { campo: 'Autorisé par', obrigatorio: true, aceitos: COLUNAS.authorizedByFamily },
            { campo: 'Valable au', obrigatorio: false, aceitos: COLUNAS.validUntil },
            { campo: 'Document', obrigatorio: false, aceitos: COLUNAS.documentoRef },
            { campo: 'Signé le', obrigatorio: false, aceitos: COLUNAS.assinadoEm },
            { campo: 'Note', obrigatorio: false, aceitos: COLUNAS.note }
        ];
    }

    return {
        HEADER_ROW_INDEX: HEADER_ROW_INDEX,
        FIRST_DATA_ROW: FIRST_DATA_ROW,
        COLUNAS: COLUNAS,
        sheetOptions: sheetOptions,
        mapRows: mapRows,
        documentacaoDeColunas: documentacaoDeColunas
    };
});
