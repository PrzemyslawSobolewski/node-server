import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppFactory } from './AppFactory.js';
import { CustomSocketIoAdapter } from './adapters/socket-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  AppFactory.setupAppInstance(app);
  app.useWebSocketAdapter(new CustomSocketIoAdapter(app));
  await app.listen(process.env.SERVER_PORT || 4000);
}
bootstrap();
