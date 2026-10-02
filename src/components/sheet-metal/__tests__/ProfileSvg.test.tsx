import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileSvg, parseProfileAngle, profilePoints } from '../ProfileSvg';

const base = {
  top_mm: 5, vertical_mm: 44, bottom_mm: 84, drip_mm: 20,
  upper_angle: '6-30°', lower_angle: '30°', bottom_angle: '88°',
};

describe('plåtskissen', () => {
  it('tolkar grader och intervall med mittvärde och faller tillbaka på felaktig text', () => {
    expect(parseProfileAngle('6-30°', 18)).toBe(18);
    expect(parseProfileAngle('45°', 88)).toBe(45);
    expect(parseProfileAngle('', 88)).toBe(88);
    expect(parseProfileAngle('okänt', 88)).toBe(88);
  });

  it('ritar olika bottenvinklar olika och visar hela intervalltexten', () => {
    const a = renderToStaticMarkup(<ProfileSvg m={{ ...base, bottom_angle: '45°' }} type="l-profil" />);
    const b = renderToStaticMarkup(<ProfileSvg m={base} type="l-profil" />);
    expect(a).toContain('6-30°');
    expect(a).toContain('45°');
    expect(a).toContain('A 14 14');
    expect(a).not.toBe(b);
    const p45 = profilePoints({ ...base, bottom_angle: '45°' });
    const p88 = profilePoints(base);
    const v45 = { x: p45[4].x - p45[3].x, y: p45[4].y - p45[3].y };
    const v88 = { x: p88[4].x - p88[3].x, y: p88[4].y - p88[3].y };
    expect(Math.atan2(v45.y, v45.x)).not.toBeCloseTo(Math.atan2(v88.y, v88.x));
  });
});