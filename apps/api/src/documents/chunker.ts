export type PageChunk = { page: number; content: string };

/** Splits each page into ~`size` character windows, preferring sentence/word boundaries, with `overlap` carry-over. */
export function chunkPages(pages: string[], size = 1000, overlap = 150): PageChunk[] {
  const chunks: PageChunk[] = [];
  pages.forEach((raw, i) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    for (let start = 0; start < text.length; ) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const window = text.slice(start, end);
        const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
        const boundary = cut > size / 2 ? cut + 1 : window.lastIndexOf(' ');
        if (boundary > size / 2) end = start + boundary;
      }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ page: i + 1, content });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  });
  return chunks;
}
