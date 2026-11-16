// The words of the delivery: who speaks, and what they say before and after the flight.

export const speakers = {
  // voice is the pitch, in hertz, of the blips that play while their words are written out.
  postmaster: { name: 'Postmaster Orso', portrait: 'portraits/postmaster.png', voice: 150 },
  keeper: { name: 'Keeper Marigold', portrait: 'portraits/keeper.png', voice: 330 },
  warden: { name: 'Warden Bram', portrait: 'portraits/warden.png', voice: 215 },
};

export interface Line {
  who: keyof typeof speakers;
  text: string;
}

const say = (who: Line['who'], ...texts: string[]): Line[] => texts.map((text) => ({ who, text }));

/** How many letters are lost on every route. */
export const LETTERS = 3;

/** A run this quick, in seconds, must have gone through the town and not round by the chimneys. */
const QUICK = 30;

/** Your boss, on the launch deck, before the first flight. */
const valleyBriefing = say(
  'postmaster',
  'There you are! One parcel, strapped on and ready. It goes to Marigold, up at the lighthouse.',
  'Marigold has asked after it every day this week, so no dawdling. Follow the beam of light and you cannot miss the place.',
  'Running low? The market chimneys will lift you back up. Or take the rings straight through town, if you have the nerve.',
  'And land gently, on the gold pad. The last courier bounced a parcel clean off the island.',
  'Oh, and three letters went astray on this round, years back. They say one never got further than the back of this very post office. Keep your eyes open.',
);

/** The lighthouse keeper, once the parcel is on the pad. */
function valleyThanks(time: number, perfect: boolean, letters: number): Line[] {
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
    ...(letters === LETTERS
      ? ['And what is this? All three of the lost letters! One of them is mine. I wrote it to my sister eleven years ago.']
      : []),
    'Thank you, courier. Tell Orso the lamp oil arrived, and that I said hello.',
  );
}

export const valleyStory = { briefing: valleyBriefing, thanks: valleyThanks };

/** A run down the gorge this quick, in seconds, must have gone through the canyon. */
const QUICK_GORGE = 60;

const gorgeBriefing = say(
  'postmaster',
  'A long one today. This box goes to Warden Bram at Amberwatch Keep, right at the far end of the gorge.',
  'It is honey cake, and Bram can smell a late parcel from a mile off. Do not stop to taste it.',
  'Thread the Needles, then drop into the canyon and keep under the bridges. That is the fast way, if you dare.',
  'Or climb the warm air off the baker\'s chimney in the Needles and stay high over the rim. Slower, but there is less to hit.',
  'The gold pad is in the keep courtyard. Come in soft. Bram counts every crumb.',
  'Three letters were lost down there too. The old couriers swore by a hollow rock east of the Needles, with a wind in it. I never found it myself.',
);

/** The warden of the keep, once the cake is on the pad. */
function gorgeThanks(time: number, perfect: boolean, letters: number): Line[] {
  const seconds = time.toFixed(1);
  return say(
    'warden',
    'Halt! Who goes... oh. Oh, it is the cake. Stand easy, courier.',
    perfect
      ? 'Not a crumb out of place. I have seen royal carriages arrive with less care.'
      : 'You came down hard enough to rattle the gate. The icing has seen better days.',
    time < QUICK_GORGE
      ? `${seconds} seconds from the post office! You came through the canyon, did you not? I heard the bridges whistle.`
      : `${seconds} seconds. The long way, over the rim. Sensible. Slow, but sensible.`,
    ...(letters === LETTERS
      ? ['Wait. Are those the three lost letters of the gorge? The watch has had a reward posted for those since before my time. It is a second cake. You have earned it.']
      : []),
    'My thanks. Tell Orso the watch eats well tonight. I may even share.',
  );
}

export const gorgeStory = { briefing: gorgeBriefing, thanks: gorgeThanks };
