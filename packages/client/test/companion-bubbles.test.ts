import { expect, it } from 'vitest';
import { CompanionBubbles } from '../src/client/companion-bubbles.js';

it('follows a projected head while keeping cards above the toolbar and bounded at the viewport edge', () => {
  const bubbles = new CompanionBubbles();
  const idle = bubbles.place('ada', 400, 0, 1000, 800, 3, false, { x: 448, y: 84 });
  expect(idle).toMatchObject({ left: 288, bottom: 134, originX: 448, originY: 84 });
  const tilted = bubbles.place('ada', 400, 0, 1000, 800, 3, false, { x: 430, y: 110 });
  expect(tilted.left).toBe(270);
  expect(tilted.bottom).toBe(148);
  expect(tilted.originX).toBe(430);
  const high = bubbles.place('ada', 400, 640, 1000, 800, 3, false, { x: 445, y: 740 });
  expect(high.bottom + 152 + 16).toBeLessThanOrEqual(784);
  expect(high.originY).toBe(740);
  expect(high.bottom).toBeGreaterThanOrEqual(8);
  const narrow = bubbles.place('ada', 600, 0, 400, 800, 1, false, { x: 648, y: 96 });
  expect(narrow.left).toBe(72);
});

it('retains an originating Bot across avoidance, reading and a subsequent resize without limiting the collection', () => {
  const bubbles = new CompanionBubbles();
  const ada = bubbles.place('ada', 200, 0, 400, 800, 1, false);
  const grace = bubbles.place('grace', 220, 0, 400, 800, 1, false);
  expect(ada.originX).toBe(248);
  expect(grace.originX).toBe(268);
  expect(grace.bottom).not.toBe(ada.bottom);
  const reading = bubbles.place('grace', 220, 0, 400, 800, 4, true, { x: 260, y: 106 });
  expect(reading.originX).toBe(260);
  expect(reading.cardHeight).toBeLessThanOrEqual(800 - reading.bottom - 56);
  const resized = bubbles.place('grace', 180, 0, 360, 600, 4, true, { x: 228, y: 96 });
  expect(resized.left).toBeLessThanOrEqual(32);
  expect(resized.bottom + 40 + resized.cardHeight).toBeLessThanOrEqual(584);
  bubbles.remove('ada');
  bubbles.remove('grace');
  expect(bubbles.place('third', 200, 0, 400, 800, 1, false).bottom).toBe(134);
});
