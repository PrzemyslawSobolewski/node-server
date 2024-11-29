import {
  INestApplication,
  ValidationPipe,
  ValidationPipeOptions,
  VersioningType,
} from '@nestjs/common';

export class AppFactory {
  static setupAppInstance(app: INestApplication) {
    this.setupVersioning(app);
    this.setupValidation(app);
    if (process.env.ENV !== 'production') {
      this.setupCors(app);
    }
  }

  private static setupValidation(app: INestApplication) {
    const validationOptions: ValidationPipeOptions = {
      transform: true,
    };

    app.useGlobalPipes(new ValidationPipe(validationOptions));
  }

  private static setupCors(app: INestApplication) {
    app.enableCors({
      methods:
        process.env.CORS_METHODS || 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [],
      allowedHeaders: process.env.CORS_HEADERS || 'Content-Type, Accept',
    });
  }

  private static setupVersioning(app: INestApplication) {
    app.enableVersioning({ type: VersioningType.URI });
  }
}
