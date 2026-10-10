import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { FakeLlm } from '../src/llm/fake.llm.js';
import { Llm } from '../src/llm/llm.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

/** Builds a minimal valid PDF with one text line per page. */
function makePdf(pages: string[]) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

const sse = (res: request.Response) =>
  [...(res.body as string).matchAll(/event: (\w+)\ndata: (.*)\n/g)].map(([, event, data]) => ({ event, data: JSON.parse(data) as unknown }));

describe('Documents + streaming Q&A (e2e)', () => {
  let app: INestApplication;
  let db: PrismaService;
  const owner = randomUUID();
  const stranger = randomUUID();
  let docId: string;

  const today = () => new Date().toISOString().slice(0, 10);
  const ask = (id: string, as: string, question: string) =>
    request(app.getHttpServer())
      .post(`/documents/${id}/ask`)
      .set('x-session-id', as)
      .send({ question })
      .buffer(true)
      .parse((res, cb) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => cb(null, body));
      });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Llm).useClass(FakeLlm).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    db = app.get(PrismaService);
    await db.usage.deleteMany({ where: { day: today() } });
  });

  afterAll(async () => {
    await db.document.deleteMany({ where: { ownerId: { in: [owner, stranger] } } });
    await db.usage.deleteMany({ where: { day: today() } });
    await app.close();
  });

  it('requires a valid session id', async () => {
    await request(app.getHttpServer()).get('/documents').expect(400);
    await request(app.getHttpServer()).get('/documents').set('x-session-id', 'nope').expect(400);
  });

  it('rejects files that are not PDFs', async () => {
    await request(app.getHttpServer()).post('/documents').set('x-session-id', owner).attach('file', Buffer.from('hello'), 'a.pdf').expect(400);
  });

  it('uploads a PDF, chunks it, and lists it', async () => {
    const pdf = makePdf(['Invoices are paid within thirty days of receipt.', 'Embeddings are stored in Postgres with the pgvector extension.']);
    const res = await request(app.getHttpServer()).post('/documents').set('x-session-id', owner).attach('file', pdf, 'notes.pdf').expect(201);
    docId = res.body.id;
    expect(res.body).toMatchObject({ name: 'notes.pdf', pages: 2 });
    const [{ count }] = await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "Chunk" WHERE "documentId" = ${docId} AND embedding IS NOT NULL`;
    expect(count).toBe(2);
    const list = await request(app.getHttpServer()).get('/documents').set('x-session-id', owner).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('streams sources first, then tokens, then done, with the right page ranked first', async () => {
    const res = await ask(docId, owner, 'Where are embeddings stored with pgvector?').expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = sse(res);
    expect(events[0].event).toBe('sources');
    expect((events[0].data as { page: number }[])[0].page).toBe(2);
    expect(events.filter((e) => e.event === 'token').length).toBeGreaterThan(3);
    expect(events.at(-1)?.event).toBe('done');
  });

  it("does not expose one visitor's document to another", async () => {
    await request(app.getHttpServer()).post(`/documents/${docId}/ask`).set('x-session-id', stranger).send({ question: 'anything' }).expect(404);
    await request(app.getHttpServer()).delete(`/documents/${docId}`).set('x-session-id', stranger).expect(404);
  });

  it('enforces the daily AI cap', async () => {
    process.env.DAILY_QUESTION_CAP = '0';
    await ask(docId, owner, 'Another question').expect(429);
    delete process.env.DAILY_QUESTION_CAP;
  });

  it('deletes documents and their chunks', async () => {
    await request(app.getHttpServer()).delete(`/documents/${docId}`).set('x-session-id', owner).expect(204);
    expect(await db.chunk.count({ where: { documentId: docId } })).toBe(0);
  });
});
