import assert from 'node:assert/strict';

export function assertGroupMotionSurface(
  header,
  profile,
  { ownerId, ownerName, count, effective, members },
) {
  const visible = Math.min(3, count);
  const overflow = count > 3 ? '+' + (count - 3) : null;
  assert.equal(header.names.length, visible);
  assert.equal(header.overflow, overflow);
  assert.equal(header.movingContainer, 0, 'Group facepile containers stay still');
  assert.equal(profile.ids.length, visible);
  const preview = [
    members.find((member) => member.slug === ownerId),
    ...members.filter((member) => member.slug !== ownerId),
  ].slice(0, 3);
  assert.deepEqual(
    profile.ids,
    preview.map((member) => member.slug),
    'Profile preview matches actual member identities',
  );
  assert.deepEqual(
    profile.avatars.map((avatar) => avatar.id),
    profile.ids,
  );
  for (let index = 0; index < preview.length; index++)
    assert.ok(
      header.names[index].startsWith(preview[index].name + ' ·'),
      'Header keeps stable member order',
    );
  assert.equal(profile.overflow, overflow, 'Profile remaining count matches membership');
  assert.equal(profile.avatars.length, visible);
  for (const avatar of profile.avatars) {
    const expected = avatar.id === ownerId ? 'working' : 'idle';
    assert.equal(avatar.state, expected, 'Profile avatar follows its own Host state');
    assert.equal(avatar.infinite > 0, effective === 'full' && expected === 'working');
  }
  for (const avatar of header.avatars) {
    const expected = avatar.title.startsWith(ownerName) ? 'working' : 'idle';
    assert.equal(avatar.state, expected);
    assert.equal(avatar.infinite > 0, effective === 'full' && expected === 'working');
  }
}
