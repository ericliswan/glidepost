import { expect, it } from 'vitest';
import { gorgeStory, speakers, valleyStory } from './story';

const { briefing, thanks } = valleyStory;

it('has the postmaster brief you and the keeper thank you', () => {
  expect(briefing.every((line) => line.who === 'postmaster')).toBe(true);
  expect(thanks(20, true).every((line) => line.who === 'keeper' && speakers[line.who].name)).toBe(true);
});

it('has the keeper remark on the landing and the time', () => {
  const said = (time: number, perfect: boolean) => thanks(time, perfect).map((line) => line.text).join(' ');
  expect(said(19.24, true)).toContain('19.2 seconds');
  expect(said(19.24, true)).toContain('feather');
  expect(said(19.24, false)).toContain('bump');
  expect(said(19.24, true)).toContain('through the middle of town');
  expect(said(48, true)).toContain('scenic');
});

it('has the warden thank you at the end of the gorge', () => {
  const said = (time: number, perfect: boolean) => gorgeStory.thanks(time, perfect).map((line) => line.text).join(' ');
  expect(gorgeStory.briefing.every((line) => line.who === 'postmaster')).toBe(true);
  expect(gorgeStory.thanks(50, true).every((line) => line.who === 'warden')).toBe(true);
  expect(said(48.26, true)).toContain('48.3 seconds');
  expect(said(48.26, true)).toContain('through the canyon');
  expect(said(48.26, false)).toContain('icing');
  expect(said(90, true)).toContain('over the rim');
});
