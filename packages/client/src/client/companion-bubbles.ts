export interface BubblePlacement {
  offset: number;
  left: number;
  cardHeight: number;
}
interface BubbleBox extends BubblePlacement {
  anchorX: number;
  right: number;
  bottom: number;
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
  ): BubblePlacement {
    const boundedLeft = (left: number) => Math.max(8, Math.min(left, width - 328));
    const minimum = 8 - (y + 134);
    const maximum = height - 16 - (y + (cards ? 286 : 158));
    const base = Math.max(minimum, Math.min(0, maximum));
    const previous = this.boxes.get(botId);
    const box = (left: number, offset: number): BubbleBox => {
      const cardHeight =
        reading && cards
          ? Math.min(cards * 112, Math.max(112, height - y - 174 - offset - 16))
          : 112;
      return {
        left,
        offset,
        cardHeight,
        anchorX: x,
        right: Math.min(width - 8, left + 320),
        bottom: y + 134 + offset,
        top: y + (cards ? 174 + cardHeight + (reading ? 0 : (cards - 1) * 8) : 158) + offset,
      };
    };
    let placed = box(boundedLeft(x - 108), base);
    if (reading && previous) {
      placed = box(
        boundedLeft(previous.left + x - previous.anchorX),
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
      for (const left of candidates) {
        for (let offset = base; offset <= maximum; offset += cards ? 160 : 32) {
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
