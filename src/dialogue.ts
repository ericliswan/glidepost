import { speakers, type Line } from './story';

// A character talking: their portrait, their name, and a line that writes itself out.

const LETTERS_PER_SECOND = 48;
const LETTERS_PER_BLIP = 3;
const el = (id: string) => document.getElementById(id)!;

/** blip is called with the speaker's pitch as their words appear. */
export function createDialogue(blip: (pitch: number) => void) {
  const box = el('dialogue');
  const portrait = el('portrait') as HTMLImageElement;
  const speaker = el('speaker');
  const written = el('written');
  const unwritten = el('unwritten');
  const spoken = el('spoken');
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lines: Line[] = [];
  let index = 0;
  let letters = 0;
  let after = () => {};

  /** Splits the line at the pen. The rest stays in place, unseen, so words never jump to a new row. */
  function draw() {
    const { text } = lines[index];
    written.textContent = text.slice(0, letters);
    unwritten.textContent = text.slice(Math.floor(letters));
    box.classList.toggle('waiting', letters >= text.length);
  }

  function show() {
    const line = lines[index];
    box.hidden = !line;
    if (!line) return;
    const who = speakers[line.who];
    portrait.src = who.portrait;
    speaker.textContent = who.name;
    // Screen readers get the whole line at once, not letter by letter.
    spoken.textContent = `${who.name}: ${line.text}`;
    letters = instant ? line.text.length : 0;
    draw();
  }

  return {
    get active() {
      return index < lines.length;
    },

    /** Starts a conversation, and calls done after its last line is dismissed. */
    play(script: Line[], done: () => void) {
      lines = script;
      index = 0;
      after = done;
      show();
    },

    /** One press: finish the line being written, or move on to the next. */
    advance() {
      if (index >= lines.length) return;
      if (letters < lines[index].text.length) {
        letters = lines[index].text.length;
        draw();
        return;
      }
      index++;
      show();
      if (index >= lines.length) after();
    },

    /** Ends the conversation without calling done. */
    close() {
      lines = [];
      index = 0;
      show();
    },

    update(dt: number) {
      if (index >= lines.length) return;
      const { who, text } = lines[index];
      if (letters >= text.length) return;
      const before = letters;
      letters = Math.min(text.length, letters + LETTERS_PER_SECOND * dt);
      if (Math.floor(letters) === Math.floor(before)) return;
      draw();
      if (Math.floor(letters / LETTERS_PER_BLIP) > Math.floor(before / LETTERS_PER_BLIP)) blip(speakers[who].voice);
    },
  };
}
