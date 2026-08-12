// =====================================================================
// useI18n — a ligação do i18n com o React
// =====================================================================
// Vive separado de js/utils/i18n.js de propósito: aquele módulo é PURO
// (dicionários, persistência, interpolação) e é testado no Vitest sem React
// nenhum. Este arquivo é a única parte que depende do React, e ele carrega
// depois de React e de i18n.js no index.html.
//
// O PADRÃO DE TODA TELA MIGRADA, e é um só:
//
//     function MinhaTela() {
//           const t = useI18n();
//           return <h1>{t('minhatela.titulo')}</h1>;
//     }
//
// Nada de prop drilling, nada de Context: o app não tem bundler e um Provider
// exigiria envolver a árvore inteira num arquivo que já é o mais delicado do
// projeto (App.js). O evento faz o mesmo trabalho com uma linha por componente.

/**
 * Devolve `t` e RE-RENDERIZA este componente quando o idioma muda.
 *
 * ⚠️ O re-render é o ponto. `window.MagboI18n.t` lê o idioma no momento da
 * chamada, então sem o listener a função devolveria o texto novo — mas
 * ninguém a chamaria de novo, e a tela ficaria na língua anterior até um
 * outro estado mudar. Foi assim que o LoginScreen (única tela migrada até
 * 12/08/2026) resolveu o problema só para si, com estado local.
 *
 * `t` é recriada a cada render de propósito: um `useCallback` com identidade
 * estável faria `useMemo`s que dependem dela não recalcularem na troca de
 * idioma — o texto mudaria, a lista memoizada não.
 */
function useI18n() {
      const [, forcarRender] = React.useState(0);

      React.useEffect(() => {
            const aoTrocar = () => forcarRender(n => n + 1);
            window.addEventListener('magbo-lang-changed', aoTrocar);
            return () => window.removeEventListener('magbo-lang-changed', aoTrocar);
      }, []);

      return (chave, params) => window.MagboI18n.t(chave, params);
}

/**
 * Idioma em vigor, para quem precisa dele e não só do texto — datas
 * (`toLocaleDateString`), ordenação, e o próprio seletor.
 *
 * Devolve o código BCP-47 que as APIs do navegador esperam: 'fr-FR' / 'pt-BR'.
 * ⚠️ As telas usavam 'pt-BR' e 'fr-FR' cravados; com o idioma configurável,
 * uma data em francês numa tela em português é a mesma mistura, só que mais
 * difícil de ver.
 */
function useLocale() {
      const t = useI18n();               // reaproveita a inscrição no evento
      void t;                            // só pelo re-render
      return window.MagboI18n.getLang() === 'pt' ? 'pt-BR' : 'fr-FR';
}
