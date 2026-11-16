import { letterSlots } from './hud';
import { levels, type Level } from './levels';
import { bestTime, foundLetters, loadSettings, saveSettings, type Settings } from './save';

// Everything that is not the flight: the front desk where a route is picked, the pause and
// settings forms, and the receipt after a delivery. It shows and hides them; main decides when.

type Screen = 'desk' | 'paused' | 'result';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function createShell(on: {
  route(level: Level): void;
  resume(): void;
  restart(): void;
  desk(): void;
  settings(settings: Settings): void;
  forget(): void;
}) {
  const screens: Record<Screen, HTMLElement> = { desk: el('desk'), paused: el('paused'), result: el('result') };
  const form = el('settings');
  const forget = el('forget');
  const volume = el<HTMLInputElement>('volume');
  const sensitivity = el<HTMLInputElement>('sensitivity');
  const invert = el<HTMLInputElement>('invert');
  const settings = loadSettings();
  let shown: Screen | null = 'desk';
  // Pressing Forget once only arms it.
  let sure = false;

  const focusFirst = (within: HTMLElement) => within.querySelector<HTMLElement>('button, input')?.focus();

  function show(next: Screen | null) {
    shown = next;
    for (const [name, screen] of Object.entries(screens)) screen.hidden = name !== next;
    form.hidden = true;
    if (next) {
      document.exitPointerLock();
      focusFirst(screens[next]);
    } else if (document.activeElement instanceof HTMLElement) {
      // So the next press of Space flies the glider, and does not press a button that has gone.
      document.activeElement.blur();
    }
  }

  function closeSettings() {
    form.hidden = true;
    if (shown) focusFirst(screens[shown]);
  }

  /** Hangs up one tag for each route, with its best time and the letters found on it. */
  function refresh() {
    el('routes').innerHTML = levels
      .map((level, i) => {
        const best = bestTime(level.id);
        const found = foundLetters(level.id);
        return `<button class="route" data-route="${level.id}"><span class="tag">
          <span class="no">Route ${i + 1}</span>
          <strong>${level.name}</strong>
          <span>${level.blurb}</span>
          <span class="kept">
            <span class="record${best ? '' : ' none'}">${best ? `Best ${best.toFixed(2)} s` : 'Not yet delivered'}</span>
            <span class="letters" role="img" aria-label="${found.filter(Boolean).length} of ${found.length} lost letters found">${letterSlots(found)}</span>
          </span>
        </span></button>`;
      })
      .join('');
  }

  addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('button');
    if (!button) return;
    const route = levels.find((level) => level.id === button.dataset.route);
    const act = button.dataset.do;
    if (route) on.route(route);
    else if (act === 'resume' || act === 'restart' || act === 'desk') on[act]();
    else if (act === 'back') closeSettings();
    else if (act === 'settings') {
      sure = false;
      forget.textContent = 'Forget my times and letters';
      form.hidden = false;
      focusFirst(form);
    } else if (button === forget) {
      if (sure) on.forget();
      forget.textContent = sure ? 'Forgotten. A clean ledger.' : 'Sure? Press again to forget';
      sure = !sure;
    }
  });

  volume.value = String(settings.volume);
  sensitivity.value = String(settings.sensitivity);
  invert.checked = settings.invert;
  form.addEventListener('input', () => {
    Object.assign(settings, { volume: Number(volume.value), sensitivity: Number(sensitivity.value), invert: invert.checked });
    saveSettings(settings);
    on.settings(settings);
  });
  on.settings(settings);
  refresh();

  return {
    /** What is in front of the game: a screen, the settings form over it, or nothing. */
    get open(): Screen | 'settings' | null {
      return form.hidden ? shown : 'settings';
    },
    /** True at the front desk, whether or not the settings form is over it. */
    get atDesk() {
      return shown === 'desk';
    },
    show,
    closeSettings,
    refresh,
    /** Writes out the receipt for a delivery, one row for each pair, and shows it. */
    receipt(rows: [string, string][]) {
      el('receipt').innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('');
      show('result');
    },
  };
}
