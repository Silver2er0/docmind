import { Injectable, NotFoundException } from '@nestjs/common';
import { toVector } from '../documents/documents.service.js';
import { UsageService } from '../documents/usage.service.js';
import { Llm } from '../llm/llm.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TOP_K = 5;

const SYSTEM =
  'You answer questions about a PDF using only the numbered excerpts provided. ' +
  'Cite the page like (p. 3). If the excerpts do not contain the answer, say you could not find it in the document. Be concise.';

export type Source = { page: number; content: string; score: number };

@Injectable()
export class ChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly llm: Llm,
    private readonly usage: UsageService,
  ) {}

  /** Retrieval step: validates ownership, charges the daily budget, returns the closest chunks. */
  async retrieve(ownerId: string, documentId: string, question: string) {
    if (!(await this.db.document.count({ where: { id: documentId, ownerId } }))) throw new NotFoundException('Document not found');
    await this.usage.consume();
    const [embedding] = await this.llm.embed([question], 'query');
    const vector = toVector(embedding);
    return this.db.$queryRaw<Source[]>`
      SELECT page, content, 1 - (embedding <=> ${vector}::vector) AS score
      FROM "Chunk" WHERE "documentId" = ${documentId}
      ORDER BY embedding <=> ${vector}::vector LIMIT ${TOP_K}`;
  }

  /** Generation step: streams answer tokens grounded in the retrieved sources. */
  answer(question: string, sources: Source[], signal: AbortSignal) {
    const context = sources.map((s, i) => `[${i + 1}] (page ${s.page}) ${s.content}`).join('\n\n');
    return this.llm.stream(SYSTEM, `Context:\n${context}\n\nQuestion: ${question}`, signal);
  }
}
