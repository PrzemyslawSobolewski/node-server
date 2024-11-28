import { Module } from '@nestjs/common';
import { ElizaController } from './eliza.controller.js';
import { ElizaService } from './eliza.service.js';

@Module({
  imports: [],
  controllers: [ElizaController],
  providers: [ElizaService],
})
export class ElizaModule {}
