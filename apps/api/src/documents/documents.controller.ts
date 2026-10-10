import { Controller, Delete, Get, HttpCode, Param, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { DocumentsService } from './documents.service.js';
import { Owner } from './owner.decorator.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Owner() owner: string) {
    return this.documents.list(owner);
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@Owner() owner: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file) throw new BadRequestException('Attach a PDF in the "file" field (max 5 MB)');
    return this.documents.upload(owner, file);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Owner() owner: string, @Param('id') id: string) {
    return this.documents.remove(owner, id);
  }
}
