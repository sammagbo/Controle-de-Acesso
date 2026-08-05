// Harness mínimo de teste do frontend.
//
// O app NÃO tem bundler: cada arquivo de js/ é um <script> global no
// index.html. Os módulos testáveis (js/utils/*.js) foram escritos no formato
// UMD para carregar dos dois jeitos — window.X no Electron, module.exports
// aqui. Nada no app precisou ser convertido para ESM.
//
// jsdom porque os módulos tocam em coisas de browser (Date, normalize) e
// porque os testes futuros de componente vão precisar de DOM.

export default {
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
        globals: true,
        reporters: 'default',
    },
};
