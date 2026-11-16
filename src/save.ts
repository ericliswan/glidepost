import { LETTERS } from './story';

// Everything the browser keeps between visits: settings, best times and which letters were found.

const KEY = 'glidepost';

export interface Settings {
  /** 0 is silent, 1 is full. */
  volume: number;
  /** A multiplier on how far the mouse moves the aim point. */
  sensitivity: number;
  /** True swaps dive and pull up, on the keys and the mouse. */
  invert: boolean;
}

export const defaults: Settings = { volume: 0.8, sensitivity: 1, invert: false };

/** Reads saved settings. Anything missing, mistyped or out of range falls back to its default. */
export function parseSettings(saved: string | null): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    raw = JSON.parse(saved ?? '{}') ?? {};
  } catch {
    // Not JSON: somebody has been at the storage. Start from the defaults.
  }
  const within = (value: unknown, lo: number, hi: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
  return {
    volume: within(raw.volume, 0, 1, defaults.volume),
    sensitivity: within(raw.sensitivity, 0.4, 2, defaults.sensitivity),
    invert: typeof raw.invert === 'boolean' ? raw.invert : defaults.invert,
  };
}

export const loadSettings = () => parseSettings(localStorage.getItem(`${KEY}.settings`));
export const saveSettings = (settings: Settings) => localStorage.setItem(`${KEY}.settings`, JSON.stringify(settings));

/** The best time on a route, in seconds, or null if it has never been delivered. */
export function bestTime(id: string): number | null {
  // Times from before there was more than one route belong to the valley.
  return Number(localStorage.getItem(`${KEY}.best.${id}`) ?? (id === 'valley' ? localStorage.getItem(`${KEY}.best`) : null)) || null;
}

export const saveBest = (id: string, time: number) => localStorage.setItem(`${KEY}.best.${id}`, String(time));

/** Which of a route's lost letters have been found. Kept as a row of 1s and 0s. */
export function foundLetters(id: string): boolean[] {
  const kept = localStorage.getItem(`${KEY}.letters.${id}`) ?? '';
  return Array.from({ length: LETTERS }, (_, i) => kept[i] === '1');
}

export const saveLetters = (id: string, found: boolean[]) => localStorage.setItem(`${KEY}.letters.${id}`, found.map(Number).join(''));

/** Wipes every time and letter, and leaves the settings alone. */
export function forget() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(`${KEY}.best`) || key.startsWith(`${KEY}.letters`)) localStorage.removeItem(key);
  }
}
