// =====================================================================
// LEITURA DO EXPORT "Renseignements personnels" DO HIKCENTRAL
// =====================================================================
// Extraído de AppSettingsModal para poder ser testado: é a única parte do
// caminho do import que roda no cliente, e a que erra em silêncio se o
// HikCentral mudar o arquivo. A INTERPRETAÇÃO (prefixo do Service, tipo,
// regra do ID) continua no backend, onde já tem 16 testes.
//
// Carrega dos dois jeitos: window.MagboHikSheet no app, module.exports no Vitest.

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboHikSheet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * As 8 primeiras linhas do arquivo são instruções do próprio HCP: o
     * cabeçalho está na LINHA 9. Índice 0-based para o xlsx.
     */
    const HEADER_ROW_INDEX = 8;

    /** Linha da planilha do primeiro registro (cabeçalho na 9). */
    const FIRST_DATA_ROW = HEADER_ROW_INDEX + 2;

    /**
     * Chave de comparação de cabeçalho: sem acento, sem caixa, sem pontuação.
     * "Prénom", "PRENOM" e "Prenom " são a mesma coluna — e o HCP não promete
     * qual delas manda.
     */
    function chave(s) {
        return String(s == null ? '' : s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z]/g, '');
    }

    /**
     * Primeiro valor não vazio entre as colunas candidatas.
     * Casa pelo NOME e nunca pela posição: o HCP reordena e acrescenta coluna
     * entre versões, e posição fixa quebra sem avisar.
     */
    function col(row, candidatos) {
        const alvos = candidatos.map(chave);
        const chaves = Object.keys(row || {});
        for (let i = 0; i < chaves.length; i++) {
            if (alvos.indexOf(chave(chaves[i])) !== -1) {
                const v = String(row[chaves[i]] == null ? '' : row[chaves[i]]).trim();
                if (v !== '') return v;
            }
        }
        return '';
    }

    /**
     * Converte as linhas já lidas pelo xlsx em HikCentralRowDto.
     *
     * Recebe o resultado de `XLSX.utils.sheet_to_json(sheet, { range: 8,
     * defval: '', raw: false })` — `raw:false` é obrigatório: a matrícula tem
     * zeros à esquerda (0004486) e o xlsx a converteria em número, comendo o
     * zero, e aí nenhuma linha casaria com app_users.
     *
     * Linha sem ID é rodapé/separador do export, não registro: sai fora.
     */
    function mapRows(json) {
        return (Array.isArray(json) ? json : [])
            .map(function (row, i) {
                return {
                    linha: FIRST_DATA_ROW + i,
                    id: col(row, ['ID']),
                    prenom: col(row, ['Prénom', 'Prenom']),
                    nom: col(row, ['Nom de famille', 'Nom']),
                    service: col(row, ['Service'])
                };
            })
            .filter(function (r) { return r.id !== ''; });
    }

    /** Opções de leitura do xlsx — um só lugar para não divergirem. */
    function sheetOptions() {
        return { range: HEADER_ROW_INDEX, defval: '', raw: false };
    }

    return {
        HEADER_ROW_INDEX: HEADER_ROW_INDEX,
        FIRST_DATA_ROW: FIRST_DATA_ROW,
        chave: chave,
        col: col,
        mapRows: mapRows,
        sheetOptions: sheetOptions
    };
});
