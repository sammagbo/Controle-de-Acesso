import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const NAVY = '#0C1B3A';
const CREAM = '#F7F4ED';
const TURQUOISE = '#48C3D2';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();

  // Timeline (em frames, 30fps, total 240 frames = 8s):
  // 0-30   (0-1s):    fade in da intro line
  // 30-90  (1-3s):    "Une réalisation"
  // 60-150 (2-5s):    "MAGBO STUDIO"
  // 120-210 (4-7s):   "sammagbo.com · 2026" + "Lycée Molière"
  // 210-240 (7-8s):   fade out global

  const fadeIn = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const realisationY = interpolate(frame, [30, 60], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const studioOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const studioScale = interpolate(frame, [60, 100], [0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const urlOpacity = interpolate(frame, [120, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const lyceeOpacity = interpolate(frame, [150, 180], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [210, 240], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: NAVY,
        fontFamily: 'Georgia, serif',
        opacity: fadeOut,
      }}
    >
      {/* Linha decorativa superior */}
      <AbsoluteFill
        style={{
          opacity: fadeIn,
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 380,
        }}
      >
        <div
          style={{
            width: 80,
            height: 3,
            backgroundColor: TURQUOISE,
            marginBottom: 60,
          }}
        />

        {/* "Une réalisation" */}
        <div
          style={{
            color: CREAM,
            opacity: 0.85,
            fontSize: 36,
            fontStyle: 'italic',
            letterSpacing: 3,
            transform: `translateY(${realisationY}px)`,
          }}
        >
          Une réalisation
        </div>

        {/* "MAGBO STUDIO" */}
        <div
          style={{
            opacity: studioOpacity,
            transform: `scale(${studioScale})`,
            color: CREAM,
            fontSize: 96,
            fontWeight: 500,
            letterSpacing: 10,
            marginTop: 30,
            marginBottom: 50,
          }}
        >
          MAGBO STUDIO
        </div>

        {/* URL */}
        <div
          style={{
            opacity: urlOpacity,
            color: TURQUOISE,
            fontSize: 32,
            fontStyle: 'italic',
            letterSpacing: 4,
            marginBottom: 80,
          }}
        >
          sammagbo.com · 2026
        </div>

        {/* Linha fina divisória */}
        <div
          style={{
            opacity: lyceeOpacity,
            width: 40,
            height: 1,
            backgroundColor: TURQUOISE,
            marginBottom: 24,
          }}
        />

        {/* Crédito Lycée */}
        <div
          style={{
            opacity: lyceeOpacity,
            color: TURQUOISE,
            fontSize: 22,
            letterSpacing: 4,
            fontWeight: 600,
          }}
        >
          LYCÉE MOLIÈRE · RIO DE JANEIRO
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
