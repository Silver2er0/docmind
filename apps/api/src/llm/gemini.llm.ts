import { BadGatewayException, Injectable } from '@nestjs/common';
import { EMBEDDING_DIMENSIONS, Llm } from './llm.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_BATCH = 100;

@Injectable()
export class GeminiLlm extends Llm {
  private readonly embedModel = process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001';
  private readonly chatModel = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';

  private async post(path: string, body: unknown, signal?: AbortSignal) {
    const res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new BadGatewayException(`LLM provider error (${res.status})`);
    return res;
  }

  async embed(texts: string[], kind: 'document' | 'query') {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const res = await this.post(`models/${this.embedModel}:batchEmbedContents`, {
        requests: texts.slice(i, i + EMBED_BATCH).map((text) => ({
          model: `models/${this.embedModel}`,
          content: { parts: [{ text }] },
          taskType: kind === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY',
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      });
      const { embeddings } = (await res.json()) as { embeddings: { values: number[] }[] };
      vectors.push(...embeddings.map((e) => e.values));
    }
    return vectors;
  }

  async *stream(system: string, prompt: string, signal: AbortSignal) {
    const res = await this.post(
      `models/${this.chatModel}:streamGenerateContent?alt=sse`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      },
      signal,
    );
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const chunk = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
        if (text) yield text;
      }
    }
  }
}
