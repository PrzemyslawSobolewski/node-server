import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SceneService } from './scene.service.js';
import { UpdateSceneRequestDto } from './dto/update-request.dto.js';
import { Injectable } from '@nestjs/common';

interface JoinPayload {
  sceneID: string;
  userToken: string;
  authToken: string;
}

@WebSocketGateway({ namespace: '/scene', cors: true })
@Injectable()
export class SceneGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map<sceneID, Set<client.id>>
  private rooms = new Map<string, Set<string>>();

  constructor(private readonly sceneService: SceneService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.query.token;
    if (!token) {
      client.emit('error', { code: 401, msg: 'Unauthorized by handshake' });
      client.disconnect();
      return;
    }

    const user = await this.sceneService.verifyUserToken(
      Array.isArray(token) ? token[0] : token,
    );
    if (!user) {
      client.emit('error', {
        code: 401,
        msg: `Unauthorized by firebase`,
      });
      client.disconnect();
      return;
    }
  }

  async handleDisconnect(client: Socket) {
    for (const [sceneID, clients] of this.rooms.entries()) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.rooms.delete(sceneID);
          await this.sceneService.clearAllSelections(sceneID);
        }
      }
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: JoinPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { sceneID, userToken, authToken } = data;
    // Verify user token
    const user = await this.sceneService.verifyUserToken(authToken);
    if (!user) {
      client.emit('error', { code: 401, msg: 'Unauthorized' });
      client.disconnect();
      return;
    }
    // Check if user is allowed to join the scene
    const allowed = await this.sceneService.checkDocCollaborator(
      sceneID,
      user.uid,
      user.email,
    );
    if (!allowed) {
      client.emit('error', { code: 403, msg: 'Forbidden' });
      client.disconnect();
      return;
    }

    client.join(sceneID);
    if (!this.rooms.has(sceneID)) this.rooms.set(sceneID, new Set());
    this.rooms.get(sceneID).add(client.id);

    // Broadcast to all clients in the room
    this.server.to(sceneID).emit('userConnected', {
      userID: user.uid,
      userToken,
    });
  }

  @SubscribeMessage('update')
  async handleUpdate(
    @MessageBody() req: UpdateSceneRequestDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { SceneID, UserToken, AuthToken } = req;
    const user = await this.sceneService.verifyUserToken(AuthToken);
    if (!user) {
      client.emit('error', { code: 401, msg: 'Unauthorized' });
      return;
    }
    const allowed = await this.sceneService.checkDocCollaborator(
      SceneID,
      user.uid,
      user.email,
    );
    if (!allowed) {
      client.emit('error', { code: 403, msg: 'Forbidden' });
      return;
    }

    try {
      await this.sceneService.applyCRDTOperations(
        SceneID,
        req.Operations,
        user.uid,
      );
    } catch (e) {
      client.emit('error', { code: 500, msg: e.message });
      return;
    }

    const state = await this.sceneService.getSceneState(req, user.uid);

    this.server.to(SceneID).emit('sceneUpdated', {
      code: 0,
      msg: 'Scene updated successfully!',
      data: state,
    });
  }

  @SubscribeMessage('disconnecting')
  async handleDisconnecting(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sceneID: string; userToken: string; authToken: string },
  ) {
    const { sceneID, userToken, authToken } = data;
    /*const user = await this.sceneService.verifyUserToken(authToken);
    if (user) {
      const editOps = await this.sceneService.clearUserSelections(
        sceneID,
        userToken,
      );
      if (editOps && editOps.length > 0) {
        this.server.to(sceneID).emit('userDisconnected', {
          userID: user.uid,
          userToken,
          operations: editOps,
        });
      }
    }*/
  }
}
