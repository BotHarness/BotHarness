import { describe, expect, it } from 'vitest';

import {
  reconcileChannelSelection,
  selectChannels,
  type ChannelSelection,
} from '../src/client/channel-selection.js';

const order = ['pin-bot', 'pin-group', 'loose', 'section-bot', 'section-group'] as const;
const empty: ChannelSelection = { ids: [], anchorId: undefined };

describe('sidebar channel selection', () => {
  it('uses the visible order across pins, loose channels, and sections', () => {
    const anchor = selectChannels(empty, order, 'pin-group', 'plain');
    expect(selectChannels(anchor, order, 'section-bot', 'range')).toEqual({
      ids: ['pin-group', 'loose', 'section-bot'],
      anchorId: 'pin-group',
    });
  });

  it('Ctrl/Command toggle extends a plain-click anchor without opening another channel', () => {
    const anchor = selectChannels(empty, order, 'pin-bot', 'plain');
    expect(selectChannels(anchor, order, 'section-group', 'toggle')).toEqual({
      ids: ['pin-bot', 'section-group'],
      anchorId: 'section-group',
    });
  });

  it('toggles a selected member off and keeps remaining rows in display order', () => {
    const current: ChannelSelection = {
      ids: ['section-group', 'loose', 'pin-bot'],
      anchorId: 'section-group',
    };
    expect(selectChannels(current, order, 'loose', 'toggle')).toEqual({
      ids: ['pin-bot', 'section-group'],
      anchorId: 'loose',
    });
  });

  it('does not include collapsed or filtered-out rows in a range', () => {
    const visible = ['pin-bot', 'loose', 'section-group'];
    const anchor = selectChannels(empty, visible, 'pin-bot', 'plain');
    expect(selectChannels(anchor, visible, 'section-group', 'range').ids).toEqual(visible);
  });

  it('prunes hidden rows and a vanished anchor before actions', () => {
    expect(
      reconcileChannelSelection({ ids: ['pin-bot', 'section-bot'], anchorId: 'section-bot' }, [
        'pin-bot',
        'loose',
      ]),
    ).toEqual({ ids: ['pin-bot'], anchorId: undefined });
  });
});
