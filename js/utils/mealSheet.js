// =====================================================================
// LEITURA DA PLANILHA DE DIREITOS DE REFEIÇÃO
// =====================================================================
// Mesmo desenho do js/utils/hikcentralSheet.js — e REUSANDO os primitivos
// dele (`chave` e `col`), que já têm teste e já resolvem o problema difícil:
// casar cabeçalho pelo NOME ignorando acento, caixa e pontuação, porque
// "Matrícula", "MATRICULA" e "matricula " são a mesma coluna e ninguém
// promete qual delas vem.
//
// ⚠️ TUDO LIDO COMO TEXTO. A matrícula tem zeros à esquerda (0001764) e o
// xlsx a converteria em número, comendo o zero — e aí nenhuma linha casaria
// com app_users. É o mesmo cuidado do import do HikCentral e do de servidores.
//
// A INTERPRETAÇÃO (o que cada status significa, o que a linha vai provocar)
// fica no BACKEND, onde tem teste. Aqui só se localiza o cabeçalho e se
// copiam os campos.
//
// Carrega dos dois jeitos:
//   • navegador → window.MagboMealSheet, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    // O helper de cabeçalho é o do HikCentral: mesma regra, um lugar só.
    const hik = (typeof module !== 'undefined' && module.exports)
        ? require('./hikcentralSheet.js')
        : root.MagboHikSheet;

    const api = factory(hik);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboMealSheet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (hik) {

    /** Cabeçalho na primeira linha — planilha da direção, não export de sistema. */
    const HEADER_ROW_INDEX = 0;

    /** Linha da planilha do primeiro registro (cabeçalho na 1). */
    const FIRST_DATA_ROW = 2;

    /**
     * Nomes aceitos por coluna, para a tela poder DOCUMENTAR o que espera.
     *
     * Português e francês porque a lista chega ora de um, ora de outro; e o
     * nome do campo do sistema, para um arquivo exportado do próprio MAGBO
     * voltar sem tradução.
     */
    const COLUNAS = {
        matricula: ['Matrícula', 'Matricula', 'Matricule', 'ID', 'employeeNo', 'userId'],
        status: ['Status', 'Statut', 'Direito', 'Droit', 'Autorizado', 'Autorisé'],
        validFrom: ['Válido de', 'Valido de', 'Valable du', 'validFrom'],
        validUntil: ['Válido até', 'Valido ate', 'Valable au', 'validUntil'],
        note: ['Observação', 'Observacao', 'Nota', 'Note', 'Remarque']
    };

    /** Opções de leitura do xlsx — um só lugar para não divergirem. */
    function sheetOptions() {
        // raw:false = tudo como texto formatado; defval:'' = célula vazia não
        // vira undefined e quebrar o `col`.
        return { range: HEADER_ROW_INDEX, defval: '', raw: false };
    }

    /**
     * Converte as linhas já lidas pelo xlsx em itens do import.
     *
     * Linha sem NENHUM campo preenchido é separador/rodapé e sai fora. Linha
     * com algo mas sem matrícula CONTINUA — quem decide o que fazer com ela é
     * o backend, que a reporta como "Linha sem matrícula" em vez de a sumir em
     * silêncio.
     */
    function mapRows(json) {
        return (Array.isArray(json) ? json : [])
            .map(function (row, i) {
                return {
                    linha: FIRST_DATA_ROW + i,
                    userId: hik.col(row, COLUNAS.matricula),
                    status: hik.col(row, COLUNAS.status),
                    validFrom: vazioParaNulo(hik.col(row, COLUNAS.validFrom)),
                    validUntil: vazioParaNulo(hik.col(row, COLUNAS.validUntil)),
                    note: vazioParaNulo(hik.col(row, COLUNAS.note))
                };
            })
            .filter(function (r) {
                return r.userId !== '' || r.status !== '';
            });
    }

    /** O backend espera null, não '' — '' viraria uma data inválida no Jackson. */
    function vazioParaNulo(v) {
        return (v === undefined || v === null || String(v).trim() === '') ? null : v;
    }

    /** Texto dos nomes aceitos, para a tela mostrar sem duplicar a lista. */
    function documentacaoDeColunas() {
        return [
            { campo: 'Matrícula', obrigatorio: true, aceitos: COLUNAS.matricula },
            { campo: 'Status', obrigatorio: true, aceitos: COLUNAS.status },
            { campo: 'Válido de', obrigatorio: false, aceitos: COLUNAS.validFrom },
            { campo: 'Válido até', obrigatorio: false, aceitos: COLUNAS.validUntil },
            { campo: 'Observação', obrigatorio: false, aceitos: COLUNAS.note }
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
