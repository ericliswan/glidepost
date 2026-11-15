// The words of the delivery: who speaks, and what they say before and after the flight.

export const speakers = {
  // voice is the pitch, in hertz, of the blips that play while their words are written out.
  postmaster: { name: 'Postmaster Orso', portrait: 'portraits/postmaster.png', voice: 150 },
  keeper: { name: 'Keeper Marigold', portrait: 'portraits/keeper.png', voice: 330 },
};

export interface Line {
  who: keyof typeof speakers;
  text: string;
}

const say = (who: Line['who'], ...texts: string[]): Line[] => texts.map((text) => ({ who, text }));

/** A run this quick, in seconds, must have gone through the town and not round by the chimneys. */
const QUICK = 30;

/** Your boss, on the launch deck, before the first flight. */
export const briefing = say(
  'postmaster',
  'There you are! One parcel, strapped on and ready. It goes to Marigold, up at the lighthouse.',
  'Marigold has asked after it every day this week, so no dawdling. Follow the beam of light and you cannot miss the place.',
  'Running low? The market chimneys will lift you back up. Or take the rings straight through town, if you have the nerve.',
  'And land gently, on the gold pad. The last courier bounced a parcel clean off the island.',
);

/** The lighthouse keeper, once the parcel is on the pad. */
export function thanks(time: number, perfect: boolean): Line[] {
  const seconds = time.toFixed(1);
  return say(
    'keeper',
    'Oh, my parcel! I had nearly given up on it.',
    perfect
      ? 'And set down as soft as a feather. Nothing inside so much as rattled.'
      : 'A bit of a bump on the way in, but it looks to be in one piece. Mostly.',
    time < QUICK
      ? `${seconds} seconds from the post office? You must have come straight through the middle of town!`
      : `${seconds} seconds, by my clock. You took the scenic way round, over the chimneys, did you not?`,
    'Thank you, courier. Tell Orso the lamp oil arrived, and that I said hello.',
  );
}
