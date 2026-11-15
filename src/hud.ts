import type { Game } from './game';
import { pad } from './world';

// The numbers and messages drawn over the game view.

const el = (id: string) => document.getElementById(id)!;

export function createHud() {
  const timer = el('timer');
  const best = el('best');
  const chain = el('chain');
  const message = el('message');
  const speed = el('speed');
  const altitude = el('altitude');
  const distance = el('distance');
  const boostFill = el('boost-fill');
  const boost = boostFill.closest('.boost')!;
  let shown = '';

  return {
    /** Sets the centre message. Lines break on "\n"; a <strong> is shown as a heading. */
    message(html: string) {
      if (html !== shown) message.innerHTML = shown = html;
    },

    update(game: Game, bestTime: number | null) {
      const g = game.glider;
      timer.textContent = game.time.toFixed(2);
      best.textContent = bestTime ? `Best ${bestTime.toFixed(2)}` : '';
      speed.textContent = String(Math.round(g.speed * 3.6));
      altitude.textContent = String(Math.round(g.y));
      distance.textContent = String(Math.round(Math.hypot(pad.x - g.x, pad.y - g.y, pad.z - g.z)));
      boostFill.style.transform = `scaleX(${g.boost})`;
      boost.classList.toggle('skimming', game.skim > 0);
      // The text is left alone when the chain ends so it can fade out.
      if (game.chain >= 2) chain.textContent = `Chain ×${game.chain}`;
      chain.classList.toggle('show', game.chain >= 2);
    },
  };
}
