import { describe, expect, it } from 'vitest';
import { assertGroupMotionSurface } from '../e2e-group-motion-proof.mjs';
const options = {
  ownerId: 'orbit',
  ownerName: 'Orbit',
  count: 5,
  effective: 'full',
  members: [
    { slug: 'quiet', name: 'Quiet' },
    { slug: 'quiet-two', name: 'Quiet two' },
    { slug: 'quiet-three', name: 'Quiet three' },
    { slug: 'quiet-four', name: 'Quiet four' },
    { slug: 'orbit', name: 'Orbit' },
  ],
};
function surface() {
  return {
    header: {
      names: ['Orbit · Working', 'Quiet · Idle', 'Quiet two · Idle'],
      overflow: '+2',
      movingContainer: 0,
      avatars: [
        { title: 'Orbit · Working', state: 'working', infinite: 1 },
        { title: 'Quiet · Idle', state: 'idle', infinite: 0 },
        { title: 'Quiet two · Idle', state: 'idle', infinite: 0 },
      ],
    },
    profile: {
      ids: ['orbit', 'quiet', 'quiet-two'],
      overflow: '+2',
      avatars: [
        { id: 'orbit', state: 'working', infinite: 1 },
        { id: 'quiet', state: 'idle', infinite: 0 },
        { id: 'quiet-two', state: 'idle', infinite: 0 },
      ],
    },
  };
}
describe('Group motion proof', () => {
  it('requires active Host identity and accurate remaining count', () => {
    const { header, profile } = surface();
    expect(() => assertGroupMotionSurface(header, profile, options)).not.toThrow();
    profile.avatars[0].state = 'idle';
    profile.avatars[0].infinite = 0;
    expect(() => assertGroupMotionSurface(header, profile, options)).toThrow('own Host state');
  });
  it('rejects animating a quiet member and an incorrect Profile +N', () => {
    const { header, profile } = surface();
    profile.avatars[1].state = 'working';
    profile.avatars[1].infinite = 1;
    expect(() => assertGroupMotionSurface(header, profile, options)).toThrow('own Host state');
    profile.avatars[1].state = 'idle';
    profile.avatars[1].infinite = 0;
    profile.overflow = '+1';
    expect(() => assertGroupMotionSurface(header, profile, options)).toThrow('remaining count');
  });
  it('rejects moving facepile containers even when avatar animation is valid', () => {
    const { header, profile } = surface();
    header.movingContainer = 1;
    expect(() => assertGroupMotionSurface(header, profile, options)).toThrow(
      'containers stay still',
    );
  });
});
