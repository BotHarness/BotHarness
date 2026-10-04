import assert from 'node:assert/strict';

export function assertGroupShellProof(proof) {
  const { messages, rendered, native, bots } = proof;
  assert.equal(messages.length, 10, 'exact scenario timeline');
  assert.equal(new Set(messages.map((m) => m.id)).size, 10, 'distinct timeline messages');
  const pairs = [
    [0, 1],
    [2, 3],
    [5, 6],
    [8, 9],
  ];
  for (const indexes of pairs) {
    const pair = indexes.map((i) => messages[i]);
    const expected = pairs.indexOf(indexes) === 0 ? bots[0].slug : bots[1].slug;
    for (const m of pair)
      assert.deepEqual(m.author, { kind: 'bot', slug: expected }, 'actual expected Bot author');
    const gap = Date.parse(pair[1].at) - Date.parse(pair[0].at);
    assert.ok(gap >= 0 && gap <= 15000, 'within grouping window');
    for (const m of pair) {
      const row = rendered.find((r) => r.id === m.id);
      assert.ok(row);
      assert.deepEqual(
        row.groupIds,
        pair.map((m) => m.id),
        'isolated consecutive pair',
      );
      assert.equal(row.size, '2');
      assert.equal(row.headers, 1);
      assert.equal(row.avatars, 1);
      assert.equal(row.human, false);
      assert.equal(row.visible, true);
      assert.ok(row.avatarLeft < row.stackLeft, 'Bot avatar on left');
    }
  }
  for (const [before, after] of [
    [1, 2],
    [3, 5],
    [6, 8],
  ]) {
    const gap = Date.parse(messages[after].at) - Date.parse(messages[before].at);
    assert.ok(gap >= 0 && gap <= 15000, 'separator proof inside grouping window');
  }
  assert.equal(messages[4].author.kind, 'human');
  const human = rendered.find((r) => r.id === messages[4].id);
  assert.equal(human?.human, true);
  assert.deepEqual(human.groupIds, [messages[4].id]);
  assert.equal(messages[7].author.kind, 'system');
  assert.equal(messages[7].memberDeparture.memberId, bots[2].slug);
  assert.equal(messages[7].memberDeparture.departureType, 'removed');
  assert.equal(rendered.find((r) => r.id === messages[7].id)?.system, true);
  const botMessages = messages.filter((m) => m.author.kind === 'bot');
  assert.equal(native.length, 8, 'eight actual native sends');
  assert.deepEqual(
    native.map((n) => n.messageId).sort(),
    botMessages.map((m) => m.id).sort(),
    'one native result per Bot message',
  );
  for (const send of native) {
    const message = botMessages.find((m) => m.id === send.messageId);
    assert.equal(send.botSlug, message.author.slug);
    assert.equal(send.body, message.body);
    assert.equal(send.isError, false);
    assert.ok(send.sessionId);
    assert.ok(
      send.callAt <= Date.parse(message.at) && Date.parse(message.at) <= send.resultAt,
      'native call surrounds commit',
    );
  }
  for (const surface of [proof.pinned, proof.pinnedReload, proof.rail]) {
    assert.equal(surface.custom.exists, true);
    assert.equal(surface.custom.images, 1);
    assert.equal(surface.custom.loaded, true);
    assert.equal(surface.custom.sourceMatches, true);
    assert.equal(surface.custom.hash, false);
    assert.ok(parseFloat(surface.custom.radius) > 0);
    assert.equal(surface.custom.overflow, 'hidden');
    assert.equal(surface.fallback.exists, true);
    assert.equal(surface.fallback.images, 0);
    assert.equal(surface.fallback.hash, true);
  }
  assert.ok(proof.narrow.scrollWidth <= proof.narrow.width, 'no narrow overflow');
  assert.deepEqual(proof.errors, []);
}
