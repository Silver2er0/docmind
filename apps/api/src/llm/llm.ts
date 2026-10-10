/** Embeddings + streaming generation. Implemented by Gemini and by an offline fake. */
export abstract class Llm {
  abstract embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]>;
  abstract stream(system: string, prompt: string, signal: AbortSignal): AsyncIterable<string>;
}

export const EMBEDDING_DIMENSIONS = 768;
