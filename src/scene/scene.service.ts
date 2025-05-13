import { Injectable } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { Scene } from './schemas/scene.schema.js';
import {
  CRDTOperationDto,
  UpdateSceneRequestDto,
} from './dto/update-request.dto.js';
import { FirebaseService } from '../firebase/firebase.service.js';

@Injectable()
export class SceneService {
  constructor(
    @InjectModel(Scene.name) private sceneModel: Model<Scene>,
    @InjectConnection() private readonly connection: Connection,
    private readonly firebaseService: FirebaseService,
  ) {}

  async verifyUserToken(
    token: string,
  ): Promise<{ uid: string; email: string } | null> {
    try {
      const decoded = await this.firebaseService.verifyIdToken(token);
      return { uid: decoded.uid, email: decoded.email };
    } catch (e) {
      console.error('Firebase token verification error:', e);
      return null;
    }
  }

  async checkDocCollaborator(
    sceneID: string,
    userID: string,
    userEmail: string,
  ): Promise<boolean> {
    const scene = await this.sceneModel
      .findOne({ ID: this.toObjectId(sceneID) })
      .lean();
    if (!scene) return false;
    if (scene.UserID === userID) return true;
    if (
      Array.isArray(scene.Collaborators) &&
      scene.Collaborators.includes(userEmail)
    )
      return true;
    return false;
  }

  async applyCRDTOperations(
    sceneID: string,
    ops: CRDTOperationDto[],
    userID: string,
  ): Promise<void> {
    const scene = await this.sceneModel
      .findOne({ ID: this.toObjectId(sceneID) })
      .lean();
    if (!scene) throw new Error('Scene not found');
    const collectionName = scene.CollectionName;
    if (!collectionName) throw new Error('Invalid scene collection name');
    const collection = this.connection.collection(collectionName);

    for (const op of ops) {
      switch (op.type) {
        case 'add': {
          const obj =
            typeof op.object === 'string' ? JSON.parse(op.object) : op.object;
          if (!obj.uuid) throw new Error('Missing object UUID for add');
          const exists = await collection.countDocuments({ uuid: obj.uuid });
          if (exists > 0) continue;
          await collection.insertOne(obj);
          break;
        }
        case 'edit': {
          const obj =
            typeof op.object === 'string' ? JSON.parse(op.object) : op.object;
          if (!obj.uuid) continue;
          await collection.replaceOne({ uuid: obj.uuid }, obj, {
            upsert: false,
          });
          break;
        }
        case 'delete': {
          if (!op.uuid) throw new Error('Missing UUID for delete');
          await collection.deleteOne({ uuid: op.uuid });
          break;
        }
        default:
          throw new Error('Unknown operation type: ' + op.type);
      }
    }
    // Update scene update time
    await this.sceneModel.updateOne(
      { ID: this.toObjectId(sceneID) },
      { $set: { UpdateTime: new Date() } },
    );
  }

  async getSceneState(req: UpdateSceneRequestDto, userID: string) {
    const scene = await this.sceneModel
      .findOne({ ID: this.toObjectId(req.SceneID) })
      .lean();
    if (!scene) throw new Error('Scene not found');
    const collectionName = scene.CollectionName;
    if (!collectionName) throw new Error('Invalid scene collection name');
    // const objects = await this.connection.collection(collectionName).find({}).toArray();
    // delete scene._id;
    // delete scene.ConversationHistory;
    return {
      userID,
      userToken: req.UserToken,
      metadata: scene,
      operations: req.Operations,
      // objects,
    };
  }

  async clearUserSelections(
    sceneID: string,
    userToken: string,
  ): Promise<any[]> {
    const scene = await this.sceneModel
      .findOne({ ID: this.toObjectId(sceneID) })
      .lean();
    if (!scene) return [];
    const collectionName = scene.CollectionName;
    if (!collectionName) return [];
    const collection = this.connection.collection(collectionName);

    // find all objects selected by the user
    const editedObjects = await collection
      .find({ 'userData.selectedBy': userToken })
      .toArray();
    // remove userData.selectedBy from all objects
    await collection.updateMany(
      { 'userData.selectedBy': userToken },
      { $unset: { 'userData.selectedBy': '' } },
    );

    return editedObjects.map((obj) => {
      if (obj.userData) delete obj.userData.selectedBy;
      return {
        type: 'edit',
        object: obj,
        uuid: obj.uuid,
        parent: '',
      };
    });
  }

  async clearAllSelections(sceneID: string): Promise<void> {
    const scene = await this.sceneModel
      .findOne({ ID: this.toObjectId(sceneID) })
      .lean();
    if (!scene) return;
    const collectionName = scene.CollectionName;
    if (!collectionName) return;
    const collection = this.connection.collection(collectionName);
    await collection.updateMany(
      { 'userData.selectedBy': { $exists: true } },
      { $unset: { 'userData.selectedBy': '' } },
    );
  }

  toObjectId(id: string): Types.ObjectId {
    if (id.length !== 24) {
      throw new Error('Invalid ObjectId length');
    }
    return new Types.ObjectId(id);
  }
}
