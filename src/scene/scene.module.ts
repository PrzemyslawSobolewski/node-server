import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Scene, SceneSchema } from './schemas/scene.schema.js';
import { SceneService } from './scene.service.js';
import { SceneGateway } from './scene.gateway.js';
import { FirebaseModule } from '../firebase/firebase.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Scene.name, schema: SceneSchema }]),
    FirebaseModule,
  ],
  providers: [SceneService, SceneGateway],
  exports: [SceneService],
})
export class SceneModule {}
