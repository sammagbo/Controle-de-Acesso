import {useEffect, useState} from 'react';
import {AbsoluteFill, Easing, Img, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import displaySemibold from '@fontsource/funnel-display/files/funnel-display-latin-600-normal.woff2';
import sansRegular from '@fontsource/funnel-sans/files/funnel-sans-latin-400-normal.woff2';
import sansMedium from '@fontsource/funnel-sans/files/funnel-sans-latin-500-normal.woff2';

// O vídeo do cartão do MAGBO Access Control em sammagbo.com: 1600 x 1000, 30 fps, 16 s, em loop (o último quadro
// é o primeiro). Mostra as telas reais de uma instância demo local com alunos fictícios, capturadas por
// video/capture/capture.mjs em public/portfolio/ (ignorado pelo git: rodar a captura antes de renderizar).
//
// 1. Um aluno autorizado, reconhecido pelo rosto, aparece em «Dans la cantine».
// 2. Uma aluna sem direito à refeição, pelo crachá, aparece em «Tentatives refusées» com «Pas de droit au repas».
// 3. O direito é dado na tela de direitos à refeição, e a passagem seguinte dela entra.

export const PORTFOLIO = {width: 1600, height: 1000, fps: 30, durationInFrames: 16 * 30};

const BLACK = '#000000';
const WHITE = '#F2F0EB';
const RED = '#FF3D2E'; // só para marcar a recusa

// A tela do app fica numa janela sobre fundo preto, com as proporções das capturas (16:10).
const WINDOW = {x: 48, y: 30, width: 1504, height: 940};
const RATIO = 900 / 1440;

type Box = {x: number; y: number; width: number; height: number};
type Manifest = {viewport: {width: number; height: number}; shots: Record<string, Record<string, Box | null>>};
// Um enquadramento da tela, em pixels CSS da captura: o centro e a largura (a altura segue a proporção).
type View = {cx: number; cy: number; w: number};

const FONTS = [
  {family: 'Funnel Display', url: displaySemibold, weight: '600'},
  {family: 'Funnel Sans', url: sansRegular, weight: '400'},
  {family: 'Funnel Sans', url: sansMedium, weight: '500'},
];

const useAssets = (): Manifest | null => {
  const [handle] = useState(() => delayRender('portfolio captures and fonts'));
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    Promise.all([
      fetch(staticFile('portfolio/manifest.json')).then((res) => res.json() as Promise<Manifest>),
      ...FONTS.map((font) =>
        new FontFace(font.family, `url(${font.url}) format('woff2')`, {weight: font.weight}).load().then((face) => {
          document.fonts.add(face);
        }),
      ),
    ])
      .then(([loaded]) => {
        setManifest(loaded as Manifest);
        continueRender(handle);
      })
      .catch((error) => cancelRender(error));
  }, [handle]);
  return manifest;
};

const ease = Easing.bezier(0.65, 0, 0.35, 1);

/** O enquadramento em `frame` ao longo dos pontos-chave [quadro, vista]: movimento suave, centro em linha reta, zoom em escala logarítmica. */
const camera = (frame: number, keys: [number, View][]): View => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i];
    if (frame <= f1) {
      const [f0, v0] = keys[i - 1];
      const t = ease((frame - f0) / (f1 - f0));
      return {
        cx: v0.cx + (v1.cx - v0.cx) * t,
        cy: v0.cy + (v1.cy - v0.cy) * t,
        w: Math.exp(Math.log(v0.w) + (Math.log(v1.w) - Math.log(v0.w)) * t),
      };
    }
  }
  return keys[keys.length - 1][1];
};

const fade = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

/** Uma aproximação lenta durante as pausas, para a imagem nunca ficar parada. */
const closer = (view: View, amount = 0.96): View => ({...view, w: view.w * amount});

const Screen: React.FC<{name: string; view: View; opacity: number; viewport: Manifest['viewport']; mark?: Box | null; markOpacity?: number}> = ({
  name,
  view,
  opacity,
  viewport,
  mark,
  markOpacity = 0,
}) => {
  const scale = WINDOW.width / view.w;
  const left = view.cx - view.w / 2;
  const top = view.cy - (view.w * RATIO) / 2;
  return (
    <AbsoluteFill style={{opacity}}>
      <Img
        src={staticFile(`portfolio/${name}.png`)}
        style={{position: 'absolute', left: -left * scale, top: -top * scale, width: viewport.width * scale, height: viewport.height * scale}}
      />
      {mark ? (
        <div
          style={{
            position: 'absolute',
            left: (mark.x - left) * scale - 10,
            top: (mark.y - top) * scale - 10,
            width: mark.width * scale + 20,
            height: mark.height * scale + 20,
            border: `5px solid ${RED}`,
            borderRadius: 24,
            opacity: markOpacity,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const Caption: React.FC<{text: string; opacity: number; refused?: boolean}> = ({text, opacity, refused}) => (
  <div
    style={{
      position: 'absolute',
      left: WINDOW.x + 40,
      bottom: PORTFOLIO.height - (WINDOW.y + WINDOW.height) + 40,
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      padding: '20px 34px',
      borderRadius: 999,
      background: 'rgba(0, 0, 0, 0.9)',
      color: WHITE,
      fontFamily: 'Funnel Display',
      fontWeight: 600,
      fontSize: 60,
      lineHeight: 1.1,
      letterSpacing: '-0.01em',
      opacity,
      transform: `translateY(${(1 - opacity) * 14}px)`,
    }}
  >
    {refused ? <span style={{width: 20, height: 20, borderRadius: '50%', background: RED, flex: 'none'}} /> : null}
    {text}
  </div>
);

export const Portfolio: React.FC = () => {
  const frame = useCurrentFrame();
  const manifest = useAssets();
  if (!manifest) return <AbsoluteFill style={{background: BLACK}} />;

  const {viewport, shots} = manifest;
  const box = (shot: string, name: string): Box => {
    const found = shots[shot]?.[name];
    if (!found) throw new Error(`manifest.json has no ${name} in ${shot}: run video/capture/capture.mjs again`);
    return found;
  };

  // Os enquadramentos, a partir das caixas medidas na captura.
  const wide: View = {cx: viewport.width / 2, cy: viewport.height / 2, w: viewport.width};
  const entryView = (shot: string): View => {
    const column = box(shot, 'column');
    return {cx: column.x - 56 + 260, cy: column.y - 16 + (520 * RATIO) / 2, w: 520};
  };
  const feed = box('monitor-2', 'feed');
  const refusal: View = {cx: feed.x + feed.width / 2, cy: feed.y - 20 + (520 * RATIO) / 2, w: 520};
  const rightsRow = box('rights-0', 'row');
  // largo o bastante para o nome e o status, que ficam longe um do outro na tabela
  const rights: View = {cx: rightsRow.x + 5 + 320, cy: rightsRow.y + rightsRow.height / 2 + 18, w: 640};

  // A linha do tempo, em quadros. Cada tela aparece em fusão sobre a anterior, que fica até ser coberta.
  const monitorCam = camera(frame, [
    [40, wide],
    [80, entryView('monitor-1')],
    [150, closer(entryView('monitor-1'))],
    [195, refusal],
    [290, closer(refusal)],
  ]);
  const rightsCam = camera(frame, [
    [272, rights],
    [378, closer(rights)],
  ]);
  const endCam = camera(frame, [
    [362, entryView('monitor-3')],
    [420, closer(entryView('monitor-3'))],
    [465, wide],
  ]);

  const layers = [
    {name: 'monitor-0', from: -1, to: 0, until: 96, view: monitorCam},
    {name: 'monitor-1', from: 80, to: 96, until: 211, view: monitorCam},
    {name: 'monitor-2', from: 195, to: 211, until: 290, view: monitorCam, mark: box('monitor-2', 'row'), markOpacity: fade(frame, 213, 228)},
    {name: 'rights-0', from: 272, to: 290, until: 336, view: rightsCam},
    {name: 'rights-1', from: 322, to: 336, until: 378, view: rightsCam},
    {name: 'monitor-3', from: 362, to: 378, until: 466, view: endCam},
    {name: 'monitor-0', from: 440, to: 466, until: PORTFOLIO.durationInFrames, view: endCam},
  ];

  const caption = (start: number, end: number) => Math.min(fade(frame, start, start + 14), 1 - fade(frame, end, end + 14));

  return (
    <AbsoluteFill style={{background: BLACK}}>
      <div
        style={{
          position: 'absolute',
          left: WINDOW.x,
          top: WINDOW.y,
          width: WINDOW.width,
          height: WINDOW.height,
          overflow: 'hidden',
          borderRadius: 22,
          boxShadow: '0 0 0 1px rgba(242, 240, 235, 0.14)',
        }}
      >
        {layers.map((layer, i) =>
          frame >= layer.from && frame < layer.until ? (
            <Screen
              key={i}
              name={layer.name}
              view={layer.view}
              opacity={layer.from < 0 ? 1 : fade(frame, layer.from, layer.to)}
              viewport={viewport}
              mark={layer.mark}
              markOpacity={layer.markOpacity}
            />
          ) : null,
        )}
      </div>
      <Caption text={'Reconnu au visage : il entre.'} opacity={caption(86, 150)} />
      <Caption text={'Badge sans droit au repas : refusé.'} opacity={caption(213, 262)} refused />
      <Caption text={'Droit accordé : elle entre.'} opacity={caption(292, 418)} />
    </AbsoluteFill>
  );
};
