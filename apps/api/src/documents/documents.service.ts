import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { extractText, getDocumentProxy } from 'unpdf';
import { Llm } from '../llm/llm.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { chunkPages } from './chunker.js';
import { UsageService } from './usage.service.js';

export const MAX_DOCUMENTS = 3;
const MAX_PAGES = 60;
const MAX_CHUNKS = 300;
const TTL_MS = 24 * 3_600_000;

export const toVector = (values: number[]) => `[${values.join(',')}]`;

@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly llm: Llm,
    private readonly usage: UsageService,
  ) {}

  /** Demo hygiene: uploaded documents are deleted after 24 hours. */
  onModuleInit() {
    const purge = () =>
      void this.db.document.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TTL_MS) } } }).catch(() => undefined);
    purge();
    setInterval(purge, 3_600_000).unref();
  }

  list(ownerId: string) {
    return this.db.document.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
  }

  async upload(ownerId: string, file: { buffer: Buffer; originalname: string }) {
    if ((await this.db.document.count({ where: { ownerId } })) >= MAX_DOCUMENTS) {
      throw new BadRequestException(`You can keep up to ${MAX_DOCUMENTS} documents. Delete one first.`);
    }
    const pages = await this.readPages(file.buffer);
    const chunks = chunkPages(pages).slice(0, MAX_CHUNKS);
    if (!chunks.length) throw new UnprocessableEntityException('No selectable text found. Scanned PDFs are not supported.');

    await this.usage.consume();
    const vectors = await this.llm.embed(
      chunks.map((c) => c.content),
      'document',
    );

    return this.db.$transaction(async (tx) => {
      const doc = await tx.document.create({ data: { ownerId, name: file.originalname.slice(0, 120), pages: pages.length } });
      await tx.$executeRaw`
        INSERT INTO "Chunk" (id, "documentId", page, idx, content, embedding)
        SELECT gen_random_uuid()::text, ${doc.id}, t.page, t.idx, t.content, t.embedding::vector
        FROM unnest(${chunks.map((c) => c.page)}::int[], ${chunks.map((_, i) => i)}::int[], ${chunks.map((c) => c.content)}::text[], ${vectors.map(toVector)}::text[])
          AS t(page, idx, content, embedding)`;
      return doc;
    });
  }

  async remove(ownerId: string, id: string) {
    const { count } = await this.db.document.deleteMany({ where: { id, ownerId } });
    if (!count) throw new NotFoundException('Document not found');
  }

  private async readPages(buffer: Buffer) {
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('Only PDF files are supported');
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      if (pdf.numPages > MAX_PAGES) throw new BadRequestException(`PDFs are limited to ${MAX_PAGES} pages`);
      return (await extractText(pdf)).text;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new UnprocessableEntityException('Could not read this PDF');
    }
  }
}
