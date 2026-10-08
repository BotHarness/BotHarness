import { expect, it } from 'vitest';
import { CompanionMotion } from '../src/client/companion-motion.js';

it('keeps angular inertia through a drag reversal, settles while held, and retains bottom alignment on release', () => {
  const motion = new CompanionMotion();
  motion.measure(1200, 800, 0.4);
  motion.grab(0, false);
  for (let i = 1; i <= 12; i++) {
    motion.drag(motion.point.x + 5, 250, i * 16, false);
    motion.advance(16, false, false, 1);
  }
  expect(motion.point.tilt).toBeGreaterThan(1);
  const angle = motion.point.tilt;
  motion.drag(motion.point.x - 8, 250, 208, false);
  expect(motion.point.tilt).toBe(angle);
  motion.advance(8, false, false, 1);
  expect(Math.abs(motion.point.tilt - angle)).toBeLessThan(2);
  for (let i = 1; i <= 30; i++) {
    motion.drag(motion.point.x - 5, 250, 208 + i * 16, false);
    motion.advance(16, false, false, 1);
  }
  expect(motion.point.tilt).toBeLessThan(-1);
  const trace: number[] = [];
  for (let i = 0; i < 200; i++) trace.push(motion.advance(16, false, false, 1).tilt);
  expect(trace.some((angle) => angle > 0)).toBe(true);
  expect(trace.every((angle) => Math.abs(angle) <= 24)).toBe(true);
  expect(motion.point.tilt).toBe(0);
  motion.release(4000, false);
  for (let i = 0; i < 250; i++) motion.advance(16, false, false, 1);
  expect(motion.point).toMatchObject({ y: 0, tilt: 0, squash: 0, phase: 'rest' });
});

it('bounds a delayed frame and clears spring energy when motion is reduced or a position is reset', () => {
  const motion = new CompanionMotion();
  motion.measure(1000, 700, 0.4);
  motion.grab(0, false);
  motion.drag(600, 200, 16, false);
  const delayed = motion.advance(60000, false, false, 1);
  expect(Number.isFinite(delayed.tilt)).toBe(true);
  expect(Math.abs(delayed.tilt)).toBeLessThanOrEqual(24);
  expect(motion.advance(0, true, false, 1)).toMatchObject({ tilt: 0, squash: 0, phase: 'drag' });
  motion.release(32, true);
  expect(motion.point).toMatchObject({ y: 0, tilt: 0, squash: 0, phase: 'rest' });
  expect(motion.advance(16, false, false, 1).tilt).toBe(0);
  motion.grab(50, false);
  motion.drag(400, 200, 66, false);
  motion.advance(64, false, false, 1);
  motion.move(200);
  expect(motion.advance(64, false, false, 1)).toMatchObject({ x: 200, tilt: 0, phase: 'rest' });
});
