import { Injectable } from '@nestjs/common';
import { EMBEDDING_DIMENSIONS, Llm } from './llm.js';

const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/** Deterministic offline provider (hashed bag-of-words) for development and tests. */
@Injectable()
export class FakeLlm extends Llm {
  embed(texts: string[]) {
    return Promise.resolve(
      texts.map((text) => {
        const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
        for (const word of tokens(text)) {
          let hash = 0;
          for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % EMBEDDING_DIMENSIONS;
          vector[hash] += 1;
        }
        return vector;
      }),
    );
  }

  async *stream(_system: string, prompt: string) {
    const context = prompt.split('Context:')[1]?.split('Question:')[0]?.trim().slice(0, 240) ?? '';
    for (const word of `(offline mode) Most relevant passage: ${context}`.split(' ')) {
      yield `${word} `;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
}
