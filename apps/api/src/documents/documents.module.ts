import { Module } from '@nestjs/common';
import { ChatController } from '../chat/chat.controller.js';
import { ChatService } from '../chat/chat.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { UsageService } from './usage.service.js';

@Module({
  controllers: [DocumentsController, ChatController],
  providers: [DocumentsService, ChatService, UsageService],
})
export class DocumentsModule {}
