import { chunkPages } from './chunker.js';

describe('chunkPages', () => {
  it('keeps short pages as a single chunk with the right page number', () => {
    expect(chunkPages(['Hello   world.', '', 'Second page.'])).toEqual([
      { page: 1, content: 'Hello world.' },
      { page: 3, content: 'Second page.' },
    ]);
  });

  it('splits long text into overlapping chunks no larger than the size', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const chunks = chunkPages([sentence.repeat(60)], 300, 60);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.content.length <= 300)).toBe(true);
    expect(chunks[0].content.endsWith('.')).toBe(true);
  });

  it('always makes progress, even without spaces', () => {
    expect(chunkPages(['x'.repeat(2500)], 1000, 150).length).toBe(3);
  });
});
