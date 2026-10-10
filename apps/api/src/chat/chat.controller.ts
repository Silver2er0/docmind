import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Owner } from '../documents/owner.decorator.js';
import { AskDto } from './ask.dto.js';
import { ChatService } from './chat.service.js';

@Controller('documents/:id')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Server-Sent Events: `sources` once, then many `token` events, then `done` (or `error`). */
  @Post('ask')
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  async ask(@Owner() owner: string, @Param('id') id: string, @Body() { question }: AskDto, @Res() res: Response) {
    const sources = await this.chat.retrieve(owner, id, question);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    send('sources', sources);
    try {
      for await (const token of this.chat.answer(question, sources, abort.signal)) send('token', token);
      send('done', null);
    } catch {
      if (!abort.signal.aborted) send('error', 'The AI provider failed. Please try again.');
    }
    res.end();
  }
}
