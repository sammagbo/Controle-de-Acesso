// =====================================================================
// PERSON PHOTO — o retrato de uma pessoa, com queda limpa
// =====================================================================
// Um componente só, usado em toda tela que mostra gente, porque a regra de
// fallback tem que ser a mesma em todas: uma foto que falha num lugar e some
// noutro é pior que nenhuma foto.
//
// A ORDEM da queda, e o porquê de cada degrau:
//   1. foto importada (user_photos)  — é o retrato que a escola cadastrou;
//   2. user.foto_url                 — override por pessoa que já existia
//                                      antes disto; quem o preencheu decidiu;
//   3. avatar de iniciais (localAvatar, SVG inline)
//                                    — sempre funciona, inclusive num kiosk
//                                      sem rede, que é o risco R1 do projeto.
//
// ⚠️ A foto NÃO entra por <img src="/api/users/X/photo">. O endpoint exige
// autenticação e o navegador não manda o cabeçalho Authorization em <img>; a
// alternativa seria abrir o endpoint, e um endpoint aberto de fotos de alunos
// é um catálogo de rostos de crianças a um GET de distância. O
// window.MagboPhotoCache busca por fetch com o token e devolve um objectURL.
//
// Enquanto a foto não chega, o avatar de iniciais JÁ está na tela — nada de
// espaço em branco piscando a cada linha de uma lista que recarrega a cada 3 s.

function PersonPhoto({ userId, nome, fotoUrl, className = '', alt = '' }) {
      const [url, setUrl] = React.useState(null);

      React.useEffect(() => {
            let vivo = true;
            setUrl(null);
            if (!userId || !window.MagboPhotoCache) return undefined;
            window.MagboPhotoCache.get(userId)
                  .then(u => { if (vivo) setUrl(u); })
                  .catch(() => { /* sem foto é melhor que sem tela */ });
            // O cleanup só marca a resposta como obsoleta. NÃO revoga o
            // objectURL: ele é do cache, compartilhado com as outras linhas que
            // mostram a mesma pessoa, e revogar aqui quebraria a foto delas.
            return () => { vivo = false; };
      }, [userId]);

      const iniciais = window.localAvatar
            ? window.localAvatar(nome || userId || '?')
            : '';
      // A ordem da queda vive no módulo (window.MagboPhotoCache.srcEfetivo),
      // com teste. Aqui só se aplica — regra em componente é regra que ninguém
      // testa e que diverge entre as telas na primeira mudança.
      const efetiva = window.MagboPhotoCache
            ? window.MagboPhotoCache.srcEfetivo(url, fotoUrl, iniciais)
            : (url || fotoUrl || iniciais);

      return React.createElement('img', {
            src: efetiva,
            alt: alt,
            className: className,
            // Uma imagem quebrada (foto_url apontando para fora do ar, por
            // exemplo) cai nas iniciais em vez de mostrar o ícone de imagem
            // rasgada do navegador.
            onError: (e) => { e.target.onerror = null; e.target.src = iniciais; }
      });
}
