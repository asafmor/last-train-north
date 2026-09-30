import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Audio, Video } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { loadFont as loadTitle } from '@remotion/google-fonts/BlackOpsOne';
import { loadFont as loadBody } from '@remotion/google-fonts/Oswald';

const { fontFamily: TITLE } = loadTitle('normal', { subsets: ['latin'] });
const { fontFamily: BODY } = loadBody('normal', { weights: ['400', '600'], subsets: ['latin'] });
const GOLD = 'linear-gradient(#fff4d0 0%, #f0c060 45%, #a8661c 55%, #ffd88a 100%)';
const URL = 'asafmor.github.io/last-train-north';
const T = 12; // transition length in frames

type Clip = { kind: 'clip'; src: string; dur: number; trim?: number; title: string; sub?: string };
type Card = { kind: 'cold' | 'logo' | 'trains' | 'outro'; dur: number };
type Scene = Clip | Card;

// Gameplay clips were captured from the real game by scripts/capture.mjs.
const SCENES: Scene[] = [
  { kind: 'cold', dur: 150 },
  { kind: 'logo', dur: 105 },
  { kind: 'clip', src: 'depart', dur: 135, trim: 10, title: 'You are the train', sub: 'Your vehicle. Your home. Your weapon.' },
  { kind: 'clip', src: 'junction', dur: 120, trim: 20, title: 'Choose your route', sub: 'Short and deadly, or long and hungry for fuel' },
  { kind: 'clip', src: 'crew', dur: 90, trim: 0, title: 'Stop. Salvage. Survive.', sub: 'Your crew strips every ruin for fuel, parts and supplies' },
  { kind: 'clip', src: 'desert', dur: 180, trim: 20, title: 'Fight off raiders', sub: 'Every bullet counts' },
  { kind: 'clip', src: 'factory', dur: 165, trim: 30, title: 'Run the gauntlet', sub: 'Barricades. Rockets. Ambushes.' },
  { kind: 'clip', src: 'canyon', dur: 105, trim: 20, title: 'Five regions', sub: 'Farmland · Desert · Industry · Canyons · Ice' },
  { kind: 'clip', src: 'snow', dur: 120, trim: 30, title: 'Through the canyons', sub: 'Rockfalls block the line' },
  { kind: 'trains', dur: 120 },
  { kind: 'clip', src: 'boom', dur: 105, trim: 0, title: 'Lose the train', sub: 'Lose everything' },
  { kind: 'clip', src: 'arrival', dur: 180, trim: 25, title: 'Into the frozen north', sub: 'The last evacuation station is waiting' },
  { kind: 'outro', dur: 210 },
];
export const TRAILER_FRAMES = SCENES.reduce((a, s) => a + s.dur, 0) - (SCENES.length - 1) * T;
// Absolute start frame of each scene (transitions overlap neighbours by T frames).
const START: number[] = [];
SCENES.reduce((at, s, i) => { START[i] = at; return at + s.dur - T; }, 0);
const at = (src: string) => START[SCENES.findIndex((s) => s.kind === 'clip' && s.src === src)];

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
);

const GoldText: React.FC<{ size: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ size, children, style }) => (
  <div style={{ fontFamily: TITLE, fontSize: size, lineHeight: 1.05, letterSpacing: size * 0.08, textTransform: 'uppercase',
    backgroundImage: GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    filter: 'drop-shadow(0 4px 0 #2a1a08) drop-shadow(0 0 24px rgba(255,160,40,0.45))', ...style }}>{children}</div>
);

// Lower-third caption on a riveted brass plate.
const Caption: React.FC<{ title: string; sub?: string; dur: number }> = ({ title, sub, dur }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const inn = spring({ frame: f - 8, fps, config: { damping: 14, stiffness: 120 } });
  const out = interpolate(f, [dur - 22, dur - 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subIn = spring({ frame: f - 18, fps, config: { damping: 200 } });
  return (
    <div style={{ position: 'absolute', left: 90, bottom: 110, opacity: out, transform: `translateX(${(1 - inn) * -700}px)` }}>
      <div style={{ display: 'inline-block', padding: '22px 44px 24px 40px', borderLeft: '10px solid #f0b050',
        background: 'linear-gradient(90deg, rgba(20,17,12,0.92), rgba(20,17,12,0.78) 80%, rgba(20,17,12,0))', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
        <GoldText size={84}>{title}</GoldText>
        {sub && <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 34, letterSpacing: 5, color: '#f2e2bc', textTransform: 'uppercase', marginTop: 8,
          opacity: subIn, transform: `translateY(${(1 - subIn) * 16}px)`, textShadow: '0 2px 6px #000' }}>{sub}</div>}
      </div>
    </div>
  );
};

const ClipScene: React.FC<{ s: Clip }> = ({ s }) => {
  const f = useCurrentFrame();
  const zoom = interpolate(f, [0, s.dur], [1.0, 1.07]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Video src={staticFile(`clips/${s.src}.mp4`)} trimBefore={s.trim ?? 0} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <Vignette />
      <Caption title={s.title} sub={s.sub} dur={s.dur} />
    </AbsoluteFill>
  );
};

const ColdOpen: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const line = (from: number, to: number) => interpolate(f, [from, from + 15, to - 12, to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Img src={staticFile('img/keyart.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${interpolate(f, [0, dur], [1.18, 1.05])}) translateX(${interpolate(f, [0, dur], [40, -20])}px)`,
        opacity: interpolate(f, [0, 30], [0, 0.85], { extrapolateRight: 'clamp' }), filter: 'saturate(0.9) brightness(0.8)' }} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: BODY, fontWeight: 600, color: '#f4e6c4',
        fontSize: 64, letterSpacing: 14, textTransform: 'uppercase', textShadow: '0 4px 20px #000, 0 0 40px #000' }}>
        <div style={{ position: 'absolute', opacity: line(8, 75) }}>The south has fallen.</div>
        <div style={{ position: 'absolute', opacity: line(78, dur) }}>One train is still running.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const LogoScene: React.FC<{ dur: number }> = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 9, stiffness: 140, mass: 0.8 } });
  const flash = interpolate(f, [0, 3, 14], [0, 0.9, 0], { extrapolateRight: 'clamp' });
  const tag = spring({ frame: f - 25, fps, config: { damping: 200 } });
  const shake = f < 12 ? Math.sin(f * 7) * (12 - f) * 1.2 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08' }}>
      <Img src={staticFile('img/keyart.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, filter: 'blur(3px) brightness(0.7)' }} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
        <Img src={staticFile('img/hud_logo.png')} style={{ width: 760, transform: `scale(${interpolate(s, [0, 1], [2.4, 1])})`, opacity: Math.min(1, s * 2),
          filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.8))' }} />
        <div style={{ marginTop: 26, fontFamily: BODY, fontWeight: 600, fontSize: 40, letterSpacing: 12, color: '#f0dcae', textTransform: 'uppercase',
          opacity: tag, transform: `translateY(${(1 - tag) * 20}px)`, textShadow: '0 3px 10px #000' }}>Keep the train moving. Reach the north.</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: '#fff3d0', opacity: flash }} />
    </AbsoluteFill>
  );
};

const TrainCard: React.FC<{ img: string; name: string; desc: string; delay: number; from: number }> = ({ img, name, desc, delay, from }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 15 } });
  return (
    <div style={{ width: 760, borderRadius: 14, overflow: 'hidden', border: '4px solid #c89a4a', background: '#14120f',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(255,180,60,0.25)', transform: `translateX(${(1 - s) * from}px)`, opacity: s }}>
      <Img src={staticFile(`img/${img}`)} style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }} />
      <div style={{ padding: '20px 28px 26px' }}>
        <GoldText size={60}>{name}</GoldText>
        <div style={{ fontFamily: BODY, fontSize: 28, color: '#e8dcc0', marginTop: 6, letterSpacing: 1 }}>{desc}</div>
      </div>
    </div>
  );
};

const TrainsScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #2a241a, #0a0907)', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 44 }}>
      <GoldText size={70} style={{ opacity: interpolate(f, [0, 15], [0, 1], { extrapolateRight: 'clamp' }) }}>Choose your locomotive</GoldText>
      <div style={{ display: 'flex', gap: 60 }}>
        <TrainCard img="card_steam.jpg" name="Ironclad" desc="Armored steam. Tough hull, heavy cannon." delay={8} from={-900} />
        <TrainCard img="card_diesel.jpg" name="Vanguard" desc="Fast diesel. Twin machine guns." delay={16} from={900} />
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const logo = spring({ frame: f, fps, config: { damping: 18 } });
  const btn = spring({ frame: f - 30, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin(f / 6) * 0.025;
  const fadeOut = interpolate(f, [dur - 20, dur], [1, 0], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity: fadeOut }}>
      <Img src={staticFile('img/keyart.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45,
        transform: `scale(${interpolate(f, [0, dur], [1.05, 1.15])})`, filter: 'brightness(0.65)' }} />
      <Vignette />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <Img src={staticFile('img/hud_logo.png')} style={{ width: 430, opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.8, 1])})` }} />
        <div style={{ marginTop: 48, transform: `scale(${btn * pulse})`, opacity: btn, padding: '26px 70px', borderRadius: 10,
          backgroundImage: `url(${staticFile('img/hud_btn.jpg')})`, backgroundSize: '100% 100%', boxShadow: '0 10px 40px rgba(0,0,0,0.7), 0 0 40px rgba(255,180,60,0.4)',
          fontFamily: BODY, fontWeight: 600, fontSize: 52, letterSpacing: 8, color: '#fff2c8', textShadow: '0 3px 3px #000', textTransform: 'uppercase' }}>
          Play free in your browser
        </div>
        <div style={{ marginTop: 26, fontFamily: BODY, fontWeight: 600, fontSize: 44, letterSpacing: 3, color: '#9dff8a', textShadow: '0 0 20px rgba(125,255,138,0.5), 0 3px 6px #000',
          opacity: interpolate(f, [45, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{URL}</div>
        <div style={{ marginTop: 18, fontFamily: BODY, fontSize: 26, letterSpacing: 4, color: '#d8ccb0', textTransform: 'uppercase',
          opacity: interpolate(f, [60, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>No install · No account · Just the train</div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', bottom: 26, width: '100%', textAlign: 'center', fontFamily: BODY, fontSize: 18, letterSpacing: 2, color: '#8a8070' }}>
        Music: "Adventure Theme Intro" by nene · "Battle Theme A" by cynicmusic (CC0, OpenGameArt)
      </div>
    </AbsoluteFill>
  );
};

// ---- Sound design (absolute frames) ----
const Sfx: React.FC<{ src: string; from: number; volume?: number }> = ({ src, from, volume = 0.6 }) => (
  <Audio src={staticFile(`sfx/${src}.mp3`)} from={Math.max(0, Math.round(from))} volume={volume} />
);
const Soundtrack: React.FC = () => {
  const battleStart = START[2] - 6;
  const sfx: [string, number, number?][] = [
    ['whistle', 30, 0.5], ['explosion_big', START[1], 0.8],
    ['whistle', at('depart') + 20, 0.35], ['clack', at('depart') + 60, 0.4], ['clack', at('depart') + 72, 0.4],
    ['hammer', at('crew') + 15, 0.35], ['hammer', at('crew') + 45, 0.35], ['chimes', at('crew') + 70, 0.4],
    ['explosion_big', at('boom') + 6, 0.9], ['explosion2', at('boom') + 34, 0.7], ['explosion1', at('boom') + 70, 0.6],
    ['whistle', at('arrival') + 90, 0.5], ['chimes', START[SCENES.length - 1] + 30, 0.5],
    ['rocket', at('factory') + 40, 0.5], ['explosion1', at('factory') + 75, 0.55], ['rocket', at('factory') + 100, 0.45], ['explosion2', at('factory') + 132, 0.5],
  ];
  for (let i = 0; i < 9; i++) sfx.push(['shot_mg', at('desert') + 25 + i * 6, 0.35], ['shot_mg', at('desert') + 95 + i * 6, 0.35]);
  for (let i = 0; i < 4; i++) sfx.push(['enemy_shot', at('desert') + 60 + i * 11, 0.25]);
  for (let i = 0; i < 5; i++) sfx.push(['shot_cannon', at('factory') + 20 + i * 24, 0.4]);
  return (
    <>
      <Audio src={staticFile('sfx/music_intro.mp3')} trimBefore={30 * 12} durationInFrames={battleStart + 30}
        volume={(f) => interpolate(f, [0, 20, battleStart - 10, battleStart + 25], [0, 0.8, 0.8, 0], { extrapolateRight: 'clamp' })} />
      <Audio src={staticFile('sfx/music_battle.mp3')} from={battleStart} durationInFrames={TRAILER_FRAMES - battleStart}
        volume={(f) => interpolate(f, [0, 25, TRAILER_FRAMES - battleStart - 70, TRAILER_FRAMES - battleStart], [0, 0.62, 0.62, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      <Audio src={staticFile('sfx/rumble_loop.mp3')} from={START[2]} durationInFrames={START[SCENES.length - 1] - START[2]} loop volume={0.22} />
      {sfx.map(([s, f, v], i) => <Sfx key={i} src={s} from={f} volume={v} />)}
    </>
  );
};

export const Trailer: React.FC = () => {
  const items: React.ReactNode[] = [];
  SCENES.forEach((s, i) => {
    if (i > 0) {
      const slideIn = s.kind === 'trains' || SCENES[i - 1].kind === 'trains';
      items.push(<TransitionSeries.Transition key={`t${i}`} timing={linearTiming({ durationInFrames: T, easing: Easing.inOut(Easing.cubic) })}
        presentation={slideIn ? slide({ direction: 'from-right' }) : fade()} />);
    }
    items.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.dur}>
        {s.kind === 'clip' ? <ClipScene s={s} /> : s.kind === 'cold' ? <ColdOpen dur={s.dur} /> : s.kind === 'logo' ? <LogoScene dur={s.dur} />
          : s.kind === 'trains' ? <TrainsScene /> : <Outro dur={s.dur} />}
      </TransitionSeries.Sequence>,
    );
  });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <TransitionSeries>{items}</TransitionSeries>
      <Soundtrack />
    </AbsoluteFill>
  );
};
