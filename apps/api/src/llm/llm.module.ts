import { Global, Module } from '@nestjs/common';
import { FakeLlm } from './fake.llm.js';
import { GeminiLlm } from './gemini.llm.js';
import { Llm } from './llm.js';

@Global()
@Module({
  providers: [{ provide: Llm, useClass: process.env.LLM_PROVIDER === 'fake' ? FakeLlm : GeminiLlm }],
  exports: [Llm],
})
export class LlmModule {}
