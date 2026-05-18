import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

const NAVY = '#0C1B3A';
const CREAM = '#F7F4ED';
const TURQUOISE = '#48C3D2';

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Timeline (em frames, 30fps):
  // 0-150   (0-5s):   pergunta retórica "Et si on simplifiait..."
  // 150-180 (5-6s):   transição fade
  // 180-360 (6-12s):  logo MAGBO aparece em 2 fases (selo, depois chave)
  // 360-390 (12-13s): título "MAGBO Access Control"
  // 390-450 (13-15s): "Système institutionnel" + fade out

  // ===== FASE 1 — PERGUNTA RETÓRICA (0-5s) =====
  const phase1Opacity = interpolate(frame, [0, 15, 120, 150], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });
  const phase1Y = interpolate(frame, [0, 30], [20, 0], {
    extrapolateRight: 'clamp',
  });

  // ===== FASE 2 — LOGO MAGBO (6-12s) =====
  // Selo aparece com spring (180-220)
  const sealScale = spring({
    frame: frame - 180,
    fps,
    config: {damping: 14, mass: 0.8},
  });
  const sealOpacity = interpolate(frame, [180, 210], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Chave desliza pra fora a partir de 240
  const keyTranslate = interpolate(frame, [240, 290], [-60, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const keyOpacity = interpolate(frame, [240, 290], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Logo fade out no final (390-450)
  const logoFadeOut = interpolate(frame, [390, 450], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ===== FASE 3 — TÍTULO (12-15s) =====
  const titleOpacity = interpolate(frame, [330, 360], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleY = interpolate(frame, [330, 360], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subtitleOpacity = interpolate(frame, [360, 390, 420, 450], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const titleFadeOut = interpolate(frame, [420, 450], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: NAVY, fontFamily: 'Georgia, serif'}}>
      {/* === FASE 1 — Pergunta retórica === */}
      <AbsoluteFill
        style={{
          opacity: phase1Opacity,
          transform: `translateY(${phase1Y}px)`,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            color: CREAM,
            fontSize: 72,
            fontStyle: 'italic',
            textAlign: 'center',
            maxWidth: 1400,
            lineHeight: 1.3,
            letterSpacing: 1,
          }}
        >
          Et si on simplifiait
          <br />
          le contrôle d'accès ?
        </div>
      </AbsoluteFill>

      {/* === FASE 2 — Logo MAGBO === */}
      <AbsoluteFill
        style={{
          opacity: sealOpacity * logoFadeOut,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{transform: `scale(${sealScale})`}}>
          <svg width="500" height="220" viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg">
            {/* Selo circular externo */}
            <circle cx="110" cy="110" r="95" stroke={TURQUOISE} strokeWidth="4" fill="none" />
            <circle cx="110" cy="110" r="78" stroke={TURQUOISE} strokeWidth="1" fill="none" />
            {/* M duas montanhas branco */}
            <path
              d="M 70 160 Q 70 60 92 60 Q 110 60 110 110 Q 110 60 128 60 Q 150 60 150 160"
              stroke={CREAM}
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Chave que desliza pra fora */}
            <g
              style={{
                transform: `translateX(${keyTranslate}px)`,
                opacity: keyOpacity,
              }}
            >
              <path
                d="M 205 110 L 380 110 L 380 145 L 348 145 L 348 128 L 322 128"
                stroke={TURQUOISE}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </g>
          </svg>
        </div>
      </AbsoluteFill>

      {/* === FASE 3 — Título e subtítulo === */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 200,
          opacity: titleFadeOut,
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            color: CREAM,
            fontSize: 108,
            fontWeight: 500,
            letterSpacing: 8,
            marginBottom: 16,
          }}
        >
          MAGBO
        </div>
        <div
          style={{
            opacity: subtitleOpacity,
            color: TURQUOISE,
            fontSize: 36,
            fontStyle: 'italic',
            letterSpacing: 4,
            fontFamily: 'Georgia, serif',
          }}
        >
          Access Control · Système institutionnel
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
