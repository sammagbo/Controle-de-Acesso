import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const NAVY = '#0C1B3A';
const CREAM = '#F7F4ED';
const TURQUOISE = '#48C3D2';

export const Demo1_Login: React.FC = () => {
  const frame = useCurrentFrame();

  // Timeline 10s = 300 frames
  // 0-30   : tela aparece (fade in)
  // 30-90  : "admin" digita progressivamente
  // 90-150 : senha digita (••••••••)
  // 150-180: cursor move pro botão
  // 180-210: botão "click" (scale)
  // 210-270: flash + fade out
  // 270-300: tela escura

  const fadeIn = interpolate(frame, [0, 30], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [240, 290], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // Digitação "admin" letra por letra (frames 30-90)
  const adminText = ['', 'a', 'ad', 'adm', 'admi', 'admin'][Math.min(5, Math.max(0, Math.floor((frame - 30) / 10)))];

  // Senha (frames 90-150)
  const passwordDots = '•'.repeat(Math.min(8, Math.max(0, Math.floor((frame - 90) / 7))));

  // Cursor position
  const cursorX = interpolate(
    frame,
    [0, 30, 90, 150, 180],
    [960, 1290, 1290, 1290, 1290],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  const cursorY = interpolate(
    frame,
    [0, 30, 90, 150, 180],
    [540, 540, 660, 770, 770],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  // Button click animation
  const buttonScale = interpolate(frame, [180, 195, 210], [1, 0.96, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Flash at click
  const flashOpacity = interpolate(frame, [195, 215, 230], [0, 0.4, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{opacity: fadeIn * fadeOut, fontFamily: 'Georgia, serif'}}>
      {/* === LADO ESQUERDO NAVY === */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '47%',
          height: '100%',
          backgroundColor: NAVY,
          padding: 80,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Top label */}
        <div>
          <div style={{width: 70, height: 2, backgroundColor: TURQUOISE, marginBottom: 14}} />
          <div style={{color: TURQUOISE, fontSize: 18, letterSpacing: 6, fontWeight: 600}}>
            CONTRÔLE D'ACCÈS
          </div>
        </div>

        {/* Logo center */}
        <div style={{display: 'flex', justifyContent: 'flex-start', alignItems: 'center'}}>
          <svg width="380" height="180" viewBox="0 0 380 180">
            <circle cx="90" cy="90" r="75" stroke={TURQUOISE} strokeWidth="4" fill="none" />
            <circle cx="90" cy="90" r="62" stroke={TURQUOISE} strokeWidth="1" fill="none" />
            <path
              d="M 60 130 Q 60 50 75 50 Q 90 50 90 90 Q 90 50 105 50 Q 120 50 120 130"
              stroke={CREAM}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M 165 90 L 320 90 L 320 116 L 295 116 L 295 102 L 275 102"
              stroke={TURQUOISE}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Brand */}
        <div>
          <div style={{color: CREAM, fontSize: 80, fontWeight: 500, letterSpacing: 4, marginBottom: 8}}>
            MAGBO
          </div>
          <div style={{color: TURQUOISE, fontSize: 32, fontStyle: 'italic', fontFamily: 'cursive'}}>
            Access Control
          </div>
          <div style={{width: 220, height: 1, backgroundColor: TURQUOISE, margin: '24px 0'}} />
          <div style={{color: CREAM, opacity: 0.85, fontSize: 22, fontStyle: 'italic'}}>
            Système institutionnel de contrôle
            <br />
            d'accès multi-secteurs
          </div>
        </div>
      </div>

      {/* === LADO DIREITO CREME === */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '53%',
          height: '100%',
          backgroundColor: CREAM,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{width: 560}}>
          <div style={{color: NAVY, fontSize: 60, fontWeight: 600, marginBottom: 12}}>Bienvenue</div>
          <div style={{color: '#1F2D52', fontSize: 22, fontStyle: 'italic', marginBottom: 8}}>
            Veuillez vous identifier pour accéder
          </div>
          <div style={{width: 40, height: 3, backgroundColor: TURQUOISE, marginBottom: 50}} />

          {/* Field 1 — Identifiant */}
          <div
            style={{
              color: NAVY,
              fontSize: 18,
              letterSpacing: 4,
              fontStyle: 'italic',
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            IDENTIFIANT
          </div>
          <div
            style={{
              border: `2px solid ${NAVY}`,
              backgroundColor: 'white',
              height: 60,
              padding: '14px 20px',
              fontSize: 24,
              color: NAVY,
              marginBottom: 36,
            }}
          >
            {adminText}
            {adminText.length < 5 && frame > 30 && frame < 90 && (
              <span style={{borderLeft: `2px solid ${TURQUOISE}`, marginLeft: 2}}>&nbsp;</span>
            )}
          </div>

          {/* Field 2 — Password */}
          <div
            style={{
              color: NAVY,
              fontSize: 18,
              letterSpacing: 4,
              fontStyle: 'italic',
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            MOT DE PASSE
          </div>
          <div
            style={{
              border: `2px solid ${NAVY}`,
              backgroundColor: 'white',
              height: 60,
              padding: '14px 20px',
              fontSize: 24,
              letterSpacing: 6,
              color: NAVY,
              marginBottom: 50,
            }}
          >
            {passwordDots}
          </div>

          {/* Button */}
          <div
            style={{
              backgroundColor: NAVY,
              height: 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${buttonScale})`,
              color: CREAM,
              fontSize: 20,
              letterSpacing: 10,
              fontStyle: 'italic',
              fontWeight: 600,
            }}
          >
            ACCÉDER →
          </div>
        </div>
      </div>

      {/* === CURSOR === */}
      <svg
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          pointerEvents: 'none',
        }}
        width="36"
        height="44"
        viewBox="0 0 36 44"
      >
        <path
          d="M 2 2 L 2 32 L 11 24 L 16 36 L 21 34 L 16 22 L 28 22 Z"
          fill="white"
          stroke="black"
          strokeWidth="1.5"
        />
      </svg>

      {/* === FLASH at click === */}
      <AbsoluteFill style={{backgroundColor: 'white', opacity: flashOpacity, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
