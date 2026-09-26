import { useAudioSettings } from "./settings";

/**
 * Every sound is synthesized with the Web Audio API: no audio files to license or download, and it
 * works offline. Browsers only allow audio after a user gesture, so the context starts on the
 * first tap.
 */

export type SoundName =
  | "flick"
  | "draw"
  | "shuffle"
  | "uno"
  | "chaChing"
  | "steal"
  | "win"
  | "lose"
  | "turn"
  | "pop"
  | "error";

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.35;
  sfxBus.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.08;
  musicBus.connect(ctx.destination);
  return ctx;
}

/** Call from a user gesture (first tap) so later sounds are allowed to play. */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
  syncMusic();
}

function tone(
  freq: number,
  {
    at = 0,
    duration = 0.15,
    type = "sine" as OscillatorType,
    volume = 1,
    slideTo = 0,
    bus = sfxBus,
  } = {},
) {
  const c = ctx;
  if (!c || !bus) return;
  const start = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(bus);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise({ at = 0, duration = 0.06, freq = 2400, volume = 0.6 } = {}) {
  const c = ctx;
  if (!c || !sfxBus) return;
  const start = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(sfxBus);
  src.start(start);
}

const NOTE = (semitones: number) => 523.25 * 2 ** (semitones / 12); // relative to C5

const SOUNDS: Record<SoundName, () => void> = {
  flick: () => noise({ freq: 3000, duration: 0.05 }),
  draw: () => noise({ freq: 1600, duration: 0.08, volume: 0.5 }),
  shuffle: () => {
    for (let i = 0; i < 6; i++)
      noise({ at: i * 0.045, freq: 2200 + i * 150, duration: 0.04, volume: 0.4 });
  },
  uno: () => {
    [0, 4, 7, 12].forEach((n, i) =>
      tone(NOTE(n), { at: i * 0.07, duration: 0.18, type: "square", volume: 0.35 }),
    );
    tone(NOTE(12), { at: 0.3, duration: 0.35, type: "triangle", volume: 0.6, slideTo: NOTE(19) });
  },
  chaChing: () => {
    noise({ freq: 5000, duration: 0.05, volume: 0.4 });
    tone(1320, { at: 0.04, duration: 0.35, type: "triangle", volume: 0.5 });
    tone(1760, { at: 0.12, duration: 0.45, type: "triangle", volume: 0.5 });
  },
  steal: () => tone(NOTE(7), { duration: 0.35, type: "sawtooth", volume: 0.25, slideTo: NOTE(-5) }),
  win: () => {
    [0, 4, 7, 12, 16, 19].forEach((n, i) =>
      tone(NOTE(n), { at: i * 0.09, duration: 0.25, type: "square", volume: 0.3 }),
    );
    [0, 4, 7].forEach((n) =>
      tone(NOTE(n + 12), { at: 0.6, duration: 0.9, type: "triangle", volume: 0.35 }),
    );
  },
  lose: () =>
    [7, 5, 2, 0].forEach((n, i) =>
      tone(NOTE(n - 12), { at: i * 0.16, duration: 0.3, type: "triangle", volume: 0.4 }),
    ),
  turn: () => {
    tone(NOTE(7), { duration: 0.18, volume: 0.45 });
    tone(NOTE(14), { at: 0.1, duration: 0.3, volume: 0.35 });
  },
  pop: () => tone(NOTE(9), { duration: 0.08, volume: 0.35, slideTo: NOTE(14) }),
  error: () => tone(140, { duration: 0.18, type: "sawtooth", volume: 0.2 }),
};

const VIBRATION: Partial<Record<SoundName, number | number[]>> = {
  uno: [40, 40, 80],
  steal: 60,
  win: [60, 60, 60, 60, 160],
  turn: 25,
  error: 30,
};

/** Plays an effect (if sound is on) and vibrates on key moments where supported. */
export function play(name: SoundName): void {
  if (!useAudioSettings.getState().sound) return;
  const c = audio();
  if (c && c.state === "running") SOUNDS[name]();
  const pattern = VIBRATION[name];
  if (pattern) navigator.vibrate?.(pattern);
}

// ---- Background music: a light pentatonic loop, scheduled ahead of time. ----

const BPM = 104;
const BEAT = 60 / BPM;
/** Melody in semitones above C5, all from the C major pentatonic scale (null = rest). */
const MELODY = [
  0,
  2,
  4,
  7,
  4,
  null,
  2,
  4,
  7,
  9,
  7,
  4,
  2,
  null,
  0,
  2,
  9,
  7,
  4,
  2,
  4,
  null,
  7,
  9,
  12,
  9,
  7,
  4,
  2,
  4,
  0,
  null,
];
const BASS = [-12, -12, -5, -5, -3, -3, -7, -7];

let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextNoteAt = 0;
let step = 0;

function scheduleMusic() {
  const c = ctx;
  if (!c || !musicBus) return;
  while (nextNoteAt < c.currentTime + 0.3) {
    const at = nextNoteAt - c.currentTime;
    const degree = MELODY[step % MELODY.length];
    if (degree !== null && degree !== undefined) {
      tone(NOTE(degree), {
        at,
        duration: BEAT * 0.45,
        type: "triangle",
        volume: 0.5,
        bus: musicBus,
      });
    }
    if (step % 4 === 0) {
      const bass = BASS[(step / 4) % BASS.length]!;
      tone(NOTE(bass - 12), { at, duration: BEAT * 1.8, type: "sine", volume: 0.8, bus: musicBus });
    }
    nextNoteAt += BEAT / 2;
    step++;
  }
}

/** Starts or stops the music loop to match the setting (music needs audio to be unlocked). */
export function syncMusic(): void {
  const c = ctx;
  const wanted = useAudioSettings.getState().music;
  if (wanted && c && c.state === "running" && !musicTimer) {
    nextNoteAt = c.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 100);
  } else if ((!wanted || !c) && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

useAudioSettings.subscribe(() => syncMusic());
