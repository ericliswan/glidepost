import { expect, it } from 'vitest';
import { gorgeStory, LETTERS, speakers, valleyStory } from './story';

const { briefing, thanks } = valleyStory;

it('has the postmaster brief you and the keeper thank you', () => {
  expect(briefing.every((line) => line.who === 'postmaster')).toBe(true);
  expect(thanks(20, true, 0).every((line) => line.who === 'keeper' && speakers[line.who].name)).toBe(true);
});

it('has the keeper remark on the landing and the time', () => {
  const said = (time: number, perfect: boolean) => thanks(time, perfect, 0).map((line) => line.text).join(' ');
  expect(said(19.24, true)).toContain('19.2 seconds');
  expect(said(19.24, true)).toContain('feather');
  expect(said(19.24, false)).toContain('bump');
  expect(said(19.24, true)).toContain('through the middle of town');
  expect(said(48, true)).toContain('scenic');
});

it('has the warden thank you at the end of the gorge', () => {
  const said = (time: number, perfect: boolean) => gorgeStory.thanks(time, perfect, 0).map((line) => line.text).join(' ');
  expect(gorgeStory.briefing.every((line) => line.who === 'postmaster')).toBe(true);
  expect(gorgeStory.thanks(50, true, 0).every((line) => line.who === 'warden')).toBe(true);
  expect(said(48.26, true)).toContain('48.3 seconds');
  expect(said(48.26, true)).toContain('through the canyon');
  expect(said(48.26, false)).toContain('icing');
  expect(said(90, true)).toContain('over the rim');
});

it('has a word about the lost letters only when all of them are brought', () => {
  for (const story of [valleyStory, gorgeStory]) {
    expect(story.briefing.some((line) => line.text.includes('letters'))).toBe(true);
    expect(story.thanks(40, true, LETTERS)).toHaveLength(story.thanks(40, true, LETTERS - 1).length + 1);
    expect(story.thanks(40, true, LETTERS).map((line) => line.text).join(' ')).toContain('lost letters');
  }
});
