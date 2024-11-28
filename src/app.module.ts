import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ElizaModule } from './eliza/eliza.module.js';

@Module({
  imports: [ElizaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
