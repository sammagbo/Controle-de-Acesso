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
                const de  = normalizarData(hik.col(row, COLUNAS.validFrom));
                const ate = normalizarData(hik.col(row, COLUNAS.validUntil));

                // ⚠️ A data ruim marca a LINHA e não lança: a planilha inteira
                // continua, e o operador vê exatamente qual célula recusar. O
                // campo vai como null para o backend (nunca o texto cru, que
                // faria o Jackson recusar o CORPO INTEIRO com 400).
                const ruins = [];
                if (de  && de.invalida)  ruins.push({ campo: 'validFrom',  valor: de.original });
                if (ate && ate.invalida) ruins.push({ campo: 'validUntil', valor: ate.original });

                return {
                    linha: FIRST_DATA_ROW + i,
                    userId: hik.col(row, COLUNAS.matricula),
                    status: hik.col(row, COLUNAS.status),
                    validFrom: (de  && de.invalida)  ? null : de,
                    validUntil: (ate && ate.invalida) ? null : ate,
                    note: vazioParaNulo(hik.col(row, COLUNAS.note)),
                    erroData: ruins.length ? ruins : null
                };
            })
            .filter(function (r) {
                return r.userId !== '' || r.status !== '';
            });
    }

    /**
     * DATA DA PLANILHA → ISO, ou marca a linha como inválida.
     *
     * ⚠️ O Jackson do backend só aceita ISO (`2026-01-09`). A planilha da Vie
     * Scolaire vem do Excel francês e escreve `09/01/2026`. Sem esta conversão o
     * corpo inteiro falha a desserialização, o backend devolve 400, e — enquanto
     * `/error` não estava no permitAll — o front recebia 403 e dizia
     * "Session expirée. Reconnectez-vous.". A pessoa reconectava e falhava de
     * novo, sem nunca ver que o problema era uma célula. (21/08/2026.)
     *
     * ⚠️⚠️ `09/01/2026` É AMBÍGUO e a escolha precisa estar escrita: aqui é
     * **DIA/MÊS/ANO** — 9 de janeiro, não 1º de setembro. A planilha é francesa,
     * o Excel em fr-FR grava dd/MM/yyyy, e é a mesma convenção que o import de
     * regimes já usa em RegimeImportService.parseData. Ler como mês/dia trocaria
     * silenciosamente a data de início de um direito de refeição — e a pessoa só
     * descobriria no dia em que a criança fosse barrada no refeitório.
     *
     * O que é aceito:
     *   2026-01-09   ISO, passa direto (planilha exportada do próprio MAGBO)
     *   09/01/2026   dd/MM/yyyy → 2026-01-09
     *   9/1/2026     idem, sem zero à esquerda
     *   09-01-2026   idem, com traço
     *
     * ⚠️ O que NÃO é aceito vira `{ invalida: true }`, e a LINHA vira CONFLITO
     * com o número dela — nunca uma exceção que derrube a importação inteira.
     * Uma planilha de 923 linhas não pode morrer por causa de uma célula, e o
     * operador precisa saber QUAL célula.
     *
     * @returns null (vazio) · string ISO (válida) · {invalida, original} (erro)
     */
    function normalizarData(v) {
        if (v === undefined || v === null) return null;
        const txt = String(v).trim();
        if (txt === '') return null;

        // Já ISO: aceita, mas confere que é uma data que existe.
        const iso = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) {
            return dataExiste(+iso[1], +iso[2], +iso[3]) ? txt : { invalida: true, original: txt };
        }

        // dd/MM/yyyy ou dd-MM-yyyy (a planilha francesa).
        const br = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (br) {
            const dia = +br[1], mes = +br[2], ano = +br[3];
            if (!dataExiste(ano, mes, dia)) return { invalida: true, original: txt };
            return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
        }

        return { invalida: true, original: txt };
    }

    /**
     * A data existe no calendário?
     *
     * ⚠️ Não basta o intervalo 1..12 e 1..31: `31/02/2026` passaria, e o
     * `new Date` do JavaScript o converteria em 3 de março SEM RECLAMAR — uma
     * data errada que ninguém veria. A conferência é ida e volta.
     */
    function dataExiste(ano, mes, dia) {
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
        const d = new Date(Date.UTC(ano, mes - 1, dia));
        return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
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
        normalizarData: normalizarData,
        documentacaoDeColunas: documentacaoDeColunas
    };
});
