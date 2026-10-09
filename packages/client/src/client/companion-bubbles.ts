export interface BubblePlacement {
  offset: number;
  left: number;
  cardHeight: number;
  bottom: number;
  originX: number;
  originY: number;
}
interface BubbleBox extends BubblePlacement {
  anchorX: number;
  right: number;
  top: number;
}
export class CompanionBubbles {
  private boxes = new Map<string, BubbleBox>();
  place(
    botId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    cards: number,
    reading: boolean,
    origin = { x: x + 48, y: y + 96 },
  ): BubblePlacement {
    const boundedLeft = (left: number) => Math.max(8, Math.min(left, width - 328));
    const bottom = Math.max(y + 134, origin.y + 38);
    const minimum = 8 - bottom;
    const collapsedOverflow = !reading && cards ? (cards - 1) * 8 : 0;
    const maximum = height - 16 - (bottom + (cards ? 152 + collapsedOverflow : 24));
    const base = Math.max(minimum, Math.min(0, maximum));
    const previous = this.boxes.get(botId);
    const box = (left: number, offset: number): BubbleBox => {
      const cardHeight =
        reading && cards
          ? Math.min(cards * 112, Math.max(112, height - bottom - 40 - offset - 16))
          : 112;
      return {
        left,
        offset,
        cardHeight,
        anchorX: origin.x,
        originX: origin.x,
        originY: origin.y,
        right: Math.min(width - 8, left + 320),
        bottom: bottom + offset,
        top: bottom + (cards ? 40 + cardHeight + (reading ? 0 : (cards - 1) * 8) : 24) + offset,
      };
    };
    let placed = box(boundedLeft(origin.x - 160), base);
    if (reading && previous) {
      placed = box(
        boundedLeft(previous.left + origin.x - previous.anchorX),
        Math.max(minimum, Math.min(previous.offset, maximum)),
      );
    } else {
      const others = [...this.boxes].filter(([id]) => id !== botId).map(([, value]) => value);
      const candidates = [
        ...new Set([
          placed.left,
          ...others.flatMap((other) => [
            boundedLeft(other.right + 8),
            boundedLeft(other.left - 328),
          ]),
        ]),
      ];
      let found = false;
      const offsets = [
        base,
        ...others.flatMap((other) => [
          other.top + 8 - bottom,
          other.bottom - 8 - placed.top + base,
        ]),
      ].filter((offset) => offset >= base && offset <= maximum);
      for (const left of candidates) {
        for (const offset of offsets) {
          const candidate = box(left, offset);
          const overlap = others.some(
            (other) =>
              candidate.left < other.right + 8 &&
              candidate.right > other.left - 8 &&
              candidate.bottom < other.top + 8 &&
              candidate.top > other.bottom - 8,
          );
          if (!overlap) {
            placed = candidate;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    this.boxes.set(botId, placed);
    return placed;
  }
  remove(botId: string): void {
    this.boxes.delete(botId);
  }
}
