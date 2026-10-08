const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function messagePreview(body: string, limit = 2000): string {
  if (body.length <= limit) return body;
  let end = 0;
  for (const part of segmenter.segment(body)) {
    const next = part.index + part.segment.length;
    if (next > limit) break;
    end = next;
  }
  return body.slice(0, end);
}

export function messageGraphemeBoundaries(body: string): readonly number[] {
  return [0, ...Array.from(segmenter.segment(body), (part) => part.index + part.segment.length)];
}
