import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppFactory } from './AppFactory.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  AppFactory.setupAppInstance(app);
  await app.listen(process.env.SERVER_PORT || 4000);
}
bootstrap();
