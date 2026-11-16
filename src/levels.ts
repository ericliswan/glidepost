import { gorge } from './levels/gorge';
import { valley } from './levels/valley';
import type { Line } from './story';
import { clearWorld, type Vec3 } from './world';

// The routes a courier can fly. Only one is built in the world at a time.

/** The light and weather of a level. */
export interface Mood {
  zenith: string;
  middle: string;
  horizon: string;
  sun: string;
  /** Points from the level towards the sun. */
  sunDirection: Vec3;
  sunlight: string;
  skylight: string;
  bounce: string;
  /** The colour in the shadowed side of the clouds. */
  cloudShade: string;
  /** The haze over the land far below. */
  land: string;
}

export interface Level {
  id: string;
  name: string;
  blurb: string;
  /** Shown under the distance to the pad, such as "to the lighthouse". */
  destination: string;
  /** The middle of the level: the land, clouds and sunlight are laid out round it. */
  centre: Vec3;
  /** How far the floor of cloud reaches from the centre, across and along. */
  spread: [number, number];
  mood: Mood;
  build(): void;
  briefing: Line[];
  thanks(time: number, perfect: boolean): Line[];
}

export const levels: Level[] = [valley, gorge];

/** Builds a level in the world, in place of whichever was there. */
export function loadLevel(level: Level) {
  clearWorld();
  level.build();
}
