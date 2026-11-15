import { expect, it } from 'vitest';
import { briefing, speakers, thanks } from './story';

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
