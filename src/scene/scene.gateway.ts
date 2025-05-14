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
  private userTokens = new Map<string, { userToken: string; userID: string }>();

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
        const info = this.userTokens.get(client.id);
        const userToken = info?.userToken;
        const userID = info?.userID;
        this.userTokens.delete(client.id);
        if (userToken) {
          const editOps = await this.sceneService.clearUserSelections(
            sceneID,
            userToken,
          );

          if (editOps && editOps.length > 0) {
            this.server.to(sceneID).emit('userDisconnected', {
              userID,
              userToken,
              operations: editOps,
            });
          }
        }
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
    this.userTokens.set(client.id, { userToken, userID: user.uid });
    if (!this.rooms.has(sceneID)) this.rooms.set(sceneID, new Set());
    this.rooms.get(sceneID).add(client.id);

    let editOps = [];
    if (userToken) {
      editOps = await this.sceneService.clearUserSelections(sceneID, userToken);
    }
    // Broadcast to all clients in the room
    this.server.to(sceneID).emit('userConnected', {
      userID: user.uid,
      userToken,
      operations: editOps,
    });
  }

  // Debounce map: Map<client.id, { timeout: NodeJS.Timeout, ops: UpdateSceneRequestDto[] }>
  private updateDebounce = new Map<
    string,
    { timeout: NodeJS.Timeout; ops: UpdateSceneRequestDto[] }
  >();

  @SubscribeMessage('update')
  async handleUpdate(
    @MessageBody() req: UpdateSceneRequestDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { sceneID, userToken, authToken } = req;
    const user = await this.sceneService.verifyUserToken(authToken);
    if (!user) {
      client.emit('error', { code: 401, msg: 'Unauthorized' });
      return;
    }

    const allowed = await this.sceneService.checkDocCollaborator(
      sceneID,
      user.uid,
      user.email,
    );
    if (!allowed) {
      client.emit('error', { code: 403, msg: 'Forbidden' });
      return;
    }

    const debounceTime = 20; // ms
    if (!this.updateDebounce.has(client.id)) {
      this.updateDebounce.set(client.id, { timeout: null, ops: [] });
    }
    const entry = this.updateDebounce.get(client.id);
    entry.ops.push(req);

    if (entry.timeout) clearTimeout(entry.timeout);

    entry.timeout = setTimeout(async () => {
      // Merge all operations from ops array
      const mergedOps = entry.ops
        .flatMap((r) => r.operations || [])
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

      req.operations = mergedOps;
      try {
        await this.sceneService.applyCRDTOperations(
          sceneID,
          mergedOps,
          user.uid,
        );
      } catch (e) {
        client.emit('error', { code: 500, msg: e.message });
        this.updateDebounce.delete(client.id);
        return;
      }

      const state = await this.sceneService.getSceneState(req, user.uid);

      this.server.to(sceneID).emit('sceneUpdated', {
        code: 0,
        msg: 'Scene updated successfully!',
        data: state,
      });

      this.updateDebounce.delete(client.id);
    }, debounceTime);
  }
}
