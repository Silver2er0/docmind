import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Global per-day counter so a public demo can never exceed the free-tier LLM quota. */
@Injectable()
export class UsageService {
  constructor(private readonly db: PrismaService) {}

  async consume() {
    const cap = Number(process.env.DAILY_QUESTION_CAP ?? 200);
    const day = new Date().toISOString().slice(0, 10);
    const { count } = await this.db.usage.upsert({
      where: { day },
      create: { day, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (count > cap) {
      throw new HttpException('The demo has reached its daily AI limit. Please try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
