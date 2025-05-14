import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: '_Scene',
})
export class Scene extends Document {
  @Prop({ required: true })
  ID: Types.ObjectId;

  @Prop()
  CollectionName: string;

  @Prop()
  UserID: string;

  @Prop([String])
  Collaborators: string[];

  @Prop({
    type: Map,
    of: { type: Map, of: [{ role: String, content: String }] },
  })
  ConversationHistory: {
    [conversationId: string]: {
      [roomId: string]: Array<{
        role: string;
        content: string;
      }>;
    };
  };
}

export const SceneSchema = SchemaFactory.createForClass(Scene);
