import { expect, it } from 'vitest';
import { defaults, parseSettings } from './save';

it('reads back what was saved', () => {
  const settings = { volume: 0.25, sensitivity: 1.5, invert: true };
  expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
});

it('falls back to the defaults for anything it cannot use', () => {
  expect(parseSettings(null)).toEqual(defaults);
  expect(parseSettings('not json')).toEqual(defaults);
  expect(parseSettings('null')).toEqual(defaults);
  expect(parseSettings('{"volume":"loud","invert":1}')).toEqual(defaults);
});

it('keeps numbers inside the range of their sliders', () => {
  expect(parseSettings('{"volume":7,"sensitivity":-3}')).toEqual({ ...defaults, volume: 1, sensitivity: 0.4 });
});
