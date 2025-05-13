import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SceneModule } from './scene/scene.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        if (config.get<string>('MONGO_CERT_PATH')) {
          return {
            uri: config.get<string>('MONGO_CONNECTION'),
            tls: true,
            tlsCertificateKeyFile: config.get<string>('MONGO_CERT_PATH'),
            authMechanism: 'MONGODB-X509',
            dbName: config.get<string>('MONGO_DB'),
          };
        } else {
          return {
            uri: config.get<string>('MONGO_CONNECTION'),
            dbName: config.get<string>('MONGO_DB'),
          };
        }
      },
    }),
    FirebaseModule,
    SceneModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
