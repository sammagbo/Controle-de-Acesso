// =====================================================================
// COLUNAS DAS TELAS DE IMPORTAÇÃO — o que é obrigatório, em um lugar só
// =====================================================================
// As telas listavam as colunas como texto corrido ("ID, Nome, Tipo, Turma,
// ResponsavelId, Parentesco, Telefone, Foto"), com tudo parecendo igualmente
// importante. Quem opera não tinha como saber, de relance, o que PRECISA estar
// preenchido — e descobria pelo erro, depois de montar a planilha inteira.
//
// ⚠️ ISTO É DOCUMENTAÇÃO, NÃO VALIDAÇÃO. Nenhuma regra de aceitação passa por
// aqui: cada entrada diz, no campo `regra`, ONDE a exigência de verdade mora.
// Se as duas divergirem, quem está errado é este arquivo — e o teste que
// compara os dois lados existe para isso doer cedo.
//
// Carrega dos dois jeitos (não há bundler no app):
//   • navegador → window.MagboImportColumns, via <script> no index.html
//   • Vitest    → module.exports

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MagboImportColumns = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    /**
     * Cadastro geral por Excel (aba "Importar").
     *
     * Regra real: UserController.createUsersBulk — recusa linha sem ID
     * ("ID obrigatório") e sem Nome ("Nome obrigatório"); para tipo ALUNO
     * também exige Turma ("Turma obrigatória para ALUNO").
     */
    const ALUNOS = {
        regra: 'backend UserController.createUsersBulk',
        colunas: [
            { campo: 'ID', obrigatorio: true, nota: 'matrícula; o formato muda por tipo (aluno: 7 dígitos)' },
            { campo: 'Nome', obrigatorio: true, nota: null },
            { campo: 'Tipo', obrigatorio: false, nota: 'em branco assume ALUNO; aceita ALUNO, PROFESSOR, FUNCIONARIO, RESPONSAVEL' },
            // Condicional de verdade — nem obrigatória sempre, nem opcional
            // sempre. Marcar como opcional esconderia a recusa que o aluno
            // sofre; marcar como obrigatória mentiria para quem importa só
            // servidores.
            { campo: 'Turma', obrigatorio: 'condicional', nota: 'obrigatória quando o Tipo é ALUNO' },
            { campo: 'ResponsavelId', obrigatorio: false, nota: null },
            { campo: 'Parentesco', obrigatorio: false, nota: null },
            { campo: 'Telefone', obrigatorio: false, nota: null },
            { campo: 'Foto', obrigatorio: false, nota: null }
        ]
    };

    /**
     * Servidores por Excel (aba "Servidores").
     *
     * Regra real: StaffAdminService — só o nome é indispensável; a matrícula
     * em branco recebe a próxima FUNC-### e o tipo em branco assume
     * FUNCIONARIO.
     */
    const SERVIDORES = {
        regra: 'backend StaffAdminService (import em lote)',
        colunas: [
            { campo: 'nome', obrigatorio: true, nota: null },
            { campo: 'matricula', obrigatorio: false, nota: 'em branco recebe a próxima FUNC-###' },
            { campo: 'hikvision_employee_id', obrigatorio: false, nota: null },
            { campo: 'tipo', obrigatorio: false, nota: 'em branco assume FUNCIONARIO; aceita PROFESSOR ou FUNCIONARIO' },
            { campo: 'departamento', obrigatorio: false, nota: 'texto livre (Vie Scolaire, Direção…)' }
        ]
    };

    /**
     * Export do HikCentral ("Renseignements personnels", cabeçalho na linha 9).
     *
     * Regra real: HikCentralImportService.planejarLinha — pula a linha sem ID
     * ("Linha sem ID") e a linha sem nome ("Linha sem nome"). O nome é montado
     * de Prénom + Nom de famille: basta UM dos dois estar preenchido, e por
     * isso os dois entram como obrigatórios "em conjunto". Service em branco
     * vira o departamento INDEFINIDO.
     */
    const HIKCENTRAL = {
        regra: 'backend HikCentralImportService.planejarLinha',
        colunas: [
            { campo: 'ID', obrigatorio: true, nota: 'linha sem ID é rodapé do export e é descartada' },
            { campo: 'Prénom', obrigatorio: 'conjunto', nota: 'com "Nom de famille" formam o nome; pelo menos um preenchido' },
            { campo: 'Nom de famille', obrigatorio: 'conjunto', nota: 'com "Prénom" formam o nome; pelo menos um preenchido' },
            { campo: 'Service', obrigatorio: false, nota: 'em branco vira o departamento INDEFINIDO' }
        ]
    };

    /**
     * Base de alunos do CDI, colada como CSV.
     *
     * Regra real: js/cdi/SettingsModal.js — a linha só entra com TRÊS campos
     * (`p.length >= 3`), e a leitura é POSICIONAL: o cabeçalho não é lido, a
     * ordem é que manda.
     */
    const CSV_CDI = {
        regra: 'js/cdi/SettingsModal.js (parse)',
        posicional: true,
        colunas: [
            { campo: 'ID', obrigatorio: true, nota: '1ª posição' },
            { campo: 'Nom', obrigatorio: true, nota: '2ª posição' },
            { campo: 'Classe', obrigatorio: true, nota: '3ª posição — a linha com menos de 3 campos é ignorada' }
        ]
    };

    /**
     * Direitos de refeição (.xlsx).
     *
     * NÃO duplica a lista: ela já existe em js/utils/mealSheet.js, junto dos
     * nomes de coluna aceitos, e duplicá-la aqui criaria duas verdades sobre a
     * mesma planilha.
     */
    function refeicoes(mealSheet) {
        const fonte = mealSheet
            || (typeof window !== 'undefined' ? window.MagboMealSheet : null);
        if (!fonte || typeof fonte.documentacaoDeColunas !== 'function') return null;
        return {
            regra: 'js/utils/mealSheet.js',
            colunas: fonte.documentacaoDeColunas().map(function (c) {
                return { campo: c.campo, obrigatorio: !!c.obrigatorio, aceitos: c.aceitos, nota: null };
            })
        };
    }

    /**
     * Fotos de identificação — não tem colunas; tem NOME DE ARQUIVO.
     *
     * Mantido aqui porque, para quem opera, é a mesma pergunta: "o que
     * precisa estar certo para a importação funcionar?".
     */
    const FOTOS = {
        regra: 'backend PhotoZipReader / UserPhotoService',
        colunas: [
            { campo: 'Nome do arquivo', obrigatorio: true, nota: 'a matrícula (0004048.jpg) ou o identificador Hikvision (1234567890.jpg) — os zeros à esquerda contam' },
            { campo: 'Formato', obrigatorio: true, nota: 'JPEG, PNG ou WebP — decidido pelos bytes, não pela extensão' }
        ]
    };

    /** true quando o campo tem de estar preenchido em toda linha. */
    function ehObrigatorio(coluna) {
        return !!coluna && coluna.obrigatorio === true;
    }

    /** true quando a exigência existe, mas depende (condicional ou em conjunto). */
    function ehCondicional(coluna) {
        return !!coluna
            && (coluna.obrigatorio === 'condicional' || coluna.obrigatorio === 'conjunto');
    }

    /** Só os nomes dos campos obrigatórios sempre — para os testes. */
    function obrigatorias(doc) {
        return ((doc && doc.colunas) || []).filter(ehObrigatorio).map(function (c) { return c.campo; });
    }

    return {
        ALUNOS: ALUNOS,
        SERVIDORES: SERVIDORES,
        HIKCENTRAL: HIKCENTRAL,
        CSV_CDI: CSV_CDI,
        FOTOS: FOTOS,
        refeicoes: refeicoes,
        ehObrigatorio: ehObrigatorio,
        ehCondicional: ehCondicional,
        obrigatorias: obrigatorias
    };
});
