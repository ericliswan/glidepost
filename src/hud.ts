import type { Game } from './game';
import { pad } from './world';

// The numbers and messages drawn over the game view.

const el = (id: string) => document.getElementById(id)!;
const still = matchMedia('(prefers-reduced-motion: reduce)');

/** One small envelope for each lost letter: sealed if it has been found, an outline if not. */
export const letterSlots = (found: boolean[]) =>
  found
    .map((got) => `<svg${got ? ' class="got"' : ''} viewBox="0 0 24 16"><rect x="1" y="1" width="22" height="14"/><path d="M1 1l11 8 11-8"/><circle cx="12" cy="9" r="2.2"/></svg>`)
    .join('');

export function createHud() {
  const timer = el('timer');
  const best = el('best');
  const chain = el('chain');
  const message = el('message');
  const speed = el('speed');
  const altitude = el('altitude');
  const distance = el('distance');
  const destination = el('destination');
  const satchel = el('satchel');
  const boostFill = el('boost-fill');
  const boost = boostFill.closest('.boost')!;
  let shown = '';
  let carried = '';
  let links = 0;

  return {
    /** Sets the centre message. Lines break on "\n". */
    message(text: string) {
      if (text !== shown) message.textContent = shown = text;
    },

    /** Names where the parcel is going, such as "to the lighthouse". */
    destination(text: string) {
      destination.textContent = text;
    },

    update(game: Game, bestTime: number | null) {
      const g = game.glider;
      timer.textContent = game.time.toFixed(2);
      best.textContent = bestTime ? `Best ${bestTime.toFixed(2)}` : '';
      speed.textContent = String(Math.round(g.speed * 3.6));
      altitude.textContent = String(Math.round(g.y));
      distance.textContent = String(Math.round(Math.hypot(pad.x - g.x, pad.y - g.y, pad.z - g.z)));
      // Clipped, not scaled, so the stripes keep their width as the meter drains.
      boostFill.style.clipPath = `inset(0 ${100 - g.boost * 100}% 0 0)`;
      boost.classList.toggle('skimming', game.skim > 0);

      if (game.found.join() !== carried) {
        carried = game.found.join();
        satchel.innerHTML = letterSlots(game.found);
        satchel.ariaLabel = `${game.found.filter(Boolean).length} of ${game.found.length} lost letters found`;
      }

      // The text is left alone when the chain ends so it can fade out.
      if (game.chain >= 2) chain.textContent = `Chain ×${game.chain}`;
      chain.classList.toggle('show', game.chain >= 2 && game.phase === 'flying');
      // Each new link comes down like a rubber stamp.
      if (game.chain > links && game.chain >= 2 && !still.matches) {
        chain.animate([{ scale: 1.5, opacity: 0.4 }, { scale: 1, opacity: 1 }], { duration: 160, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
      }
      links = game.chain;
    },
  };
}
