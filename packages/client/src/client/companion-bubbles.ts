interface BubbleBox {
  offset: number;
  left: number;
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
    cards: boolean,
    reading: boolean,
  ): number {
    const left = Math.max(8, Math.min(x - 108, width - 328));
    const minimum = 8 - (y + 134);
    const maximum = height - 16 - (y + (cards ? 286 : 158));
    const base = Math.max(minimum, Math.min(0, maximum));
    const previous = this.boxes.get(botId);
    let offset = reading && previous ? Math.max(minimum, Math.min(previous.offset, maximum)) : base;
    for (
      let candidate = base;
      !(reading && previous) && candidate <= maximum;
      candidate += cards ? 160 : 32
    ) {
      const box = {
        left,
        right: Math.min(width - 8, left + 320),
        bottom: y + 134 + candidate,
        top: y + (cards ? 286 : 158) + candidate,
      };
      const overlap = [...this.boxes].some(
        ([id, other]) =>
          id !== botId &&
          box.left < other.right + 8 &&
          box.right > other.left - 8 &&
          box.bottom < other.top + 8 &&
          box.top > other.bottom - 8,
      );
      offset = candidate;
      if (!overlap) break;
    }
    this.boxes.set(botId, {
      offset,
      left,
      right: Math.min(width - 8, left + 320),
      bottom: y + 134 + offset,
      top: y + (cards ? 286 : 158) + offset,
    });
    return offset;
  }
  remove(botId: string): void {
    this.boxes.delete(botId);
  }
}
