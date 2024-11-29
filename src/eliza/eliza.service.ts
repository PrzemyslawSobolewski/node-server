import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRequestDto } from './dto/message-request.dto.js';
import {
  Content,
  Memory,
  ModelClass,
  composeContext,
  generateMessageResponse,
  stringToUuid,
  AgentRuntime,
  elizaLogger,
  Character,
  IDatabaseCacheAdapter,
  CacheManager,
  DbCacheAdapter,
  IDatabaseAdapter,
  ICacheManager,
  ModelProviderName,
  settings,
} from '@ai16z/eliza';
import { CHARACTER, MESSAGE_HANDLER_TEMPLATE } from './constants/index.js';
import { bootstrapPlugin } from '@ai16z/plugin-bootstrap';
import path from 'path';
import fs from 'fs';
import nodePlugin from '@ai16z/plugin-node';
import Database from 'better-sqlite3';
import { SqliteDatabaseAdapter } from '@ai16z/adapter-sqlite';
import PostgresDatabaseAdapter from '@ai16z/adapter-postgres';
import { fileURLToPath } from 'url';
import { UUID } from '@ai16z/eliza';

@Injectable()
export class ElizaService {
  private agents: Map<string, AgentRuntime> = new Map();

  async startAgent(agentId: UUID, character?: Character): Promise<string> {
    try {
      if (!character) {
        character = CHARACTER;
      } else {
        character = {
          ...CHARACTER,
          ...character,
        };
      }
      character.id ??= agentId;
      character.username ??= character.name;

      const currentAgent = this.agents.get(agentId);
      if (currentAgent) {
        return currentAgent.agentId;
      }

      const token = this.getTokenForProvider(
        character.modelProvider,
        character,
      );

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const dataDir = path.join(__dirname, '../data');

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const db = this.initializeDatabase(dataDir);

      await db.init();

      const cache = this.intializeDbCache(character, db);
      const runtime = this.createAgent(character, db, cache, token, agentId);

      await runtime.initialize();

      this.registerAgent(runtime);

      return runtime.agentId;
    } catch (error) {
      elizaLogger.error(
        `Error starting agent for character ${character.name}:`,
        error,
      );
      console.error(error);
      throw error;
    }
  }

  getTokenForProvider(provider: ModelProviderName, character: Character) {
    switch (provider) {
      case ModelProviderName.OPENAI:
        return (
          character.settings?.secrets?.OPENAI_API_KEY || settings.OPENAI_API_KEY
        );
      case ModelProviderName.LLAMACLOUD:
        return (
          character.settings?.secrets?.LLAMACLOUD_API_KEY ||
          settings.LLAMACLOUD_API_KEY ||
          character.settings?.secrets?.TOGETHER_API_KEY ||
          settings.TOGETHER_API_KEY ||
          character.settings?.secrets?.XAI_API_KEY ||
          settings.XAI_API_KEY ||
          character.settings?.secrets?.OPENAI_API_KEY ||
          settings.OPENAI_API_KEY
        );
      case ModelProviderName.ANTHROPIC:
        return (
          character.settings?.secrets?.ANTHROPIC_API_KEY ||
          character.settings?.secrets?.CLAUDE_API_KEY ||
          settings.ANTHROPIC_API_KEY ||
          settings.CLAUDE_API_KEY
        );
      case ModelProviderName.REDPILL:
        return (
          character.settings?.secrets?.REDPILL_API_KEY ||
          settings.REDPILL_API_KEY
        );
      case ModelProviderName.OPENROUTER:
        return (
          character.settings?.secrets?.OPENROUTER || settings.OPENROUTER_API_KEY
        );
      case ModelProviderName.GROK:
        return (
          character.settings?.secrets?.GROK_API_KEY || settings.GROK_API_KEY
        );
      case ModelProviderName.HEURIST:
        return (
          character.settings?.secrets?.HEURIST_API_KEY ||
          settings.HEURIST_API_KEY
        );
      case ModelProviderName.GROQ:
        return (
          character.settings?.secrets?.GROQ_API_KEY || settings.GROQ_API_KEY
        );
    }
  }

  intializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    const cache = new CacheManager(new DbCacheAdapter(db, character.id));
    return cache;
  }

  initializeDatabase(dataDir: string) {
    if (process.env.POSTGRES_URL) {
      const db = new PostgresDatabaseAdapter({
        connectionString: process.env.POSTGRES_URL,
      });
      return db;
    } else {
      const filePath =
        process.env.SQLITE_FILE ?? path.resolve(dataDir, 'db.sqlite');
      // ":memory:";
      const db = new SqliteDatabaseAdapter(new Database(filePath));
      return db;
    }
  }

  createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string,
    agentId: UUID,
  ) {
    elizaLogger.success(
      elizaLogger.successesTitle,
      'Creating runtime for character',
      character.name,
    );
    return new AgentRuntime({
      agentId,
      databaseAdapter: db,
      token,
      modelProvider: character.modelProvider,
      evaluators: [],
      character,
      plugins: [bootstrapPlugin, nodePlugin].filter(Boolean),
      providers: [],
      actions: [],
      services: [],
      managers: [],
      cacheManager: cache,
    });
  }

  async processMessage(agentId: string, request: MessageRequestDto) {
    let runtime = this.agents.get(agentId);

    if (!runtime) {
      runtime = Array.from(this.agents.values()).find(
        (a) => a.character.name.toLowerCase() === agentId.toLowerCase(),
      );
    }

    if (!runtime) {
      throw new NotFoundException('Agent not found');
    }

    const roomId = stringToUuid(request.roomId ?? 'default-room-' + agentId);
    const userId = stringToUuid(request.userId ?? 'user');

    await runtime.ensureConnection(
      userId,
      roomId,
      request.userName,
      request.name,
      'direct',
    );

    const text = request.text;
    const messageId = stringToUuid(Date.now().toString());

    const content: Content = {
      text,
      attachments: [],
      source: 'direct',
      inReplyTo: undefined,
    };

    const userMessage = {
      content,
      userId,
      roomId,
      agentId: runtime.agentId,
    };

    const memory: Memory = {
      id: messageId,
      agentId: runtime.agentId,
      userId,
      roomId,
      content,
      createdAt: Date.now(),
    };

    await runtime.messageManager.createMemory(memory);

    const state = await runtime.composeState(userMessage, {
      agentName: runtime.character.name,
    });

    const context = composeContext({
      state,
      template: MESSAGE_HANDLER_TEMPLATE,
    });

    const response = await generateMessageResponse({
      runtime,
      context,
      modelClass: ModelClass.SMALL,
    });

    if (!response) {
      return null;
    }

    const responseMessage = {
      ...userMessage,
      userId: runtime.agentId,
      content: response,
    };

    await runtime.messageManager.createMemory(responseMessage);

    await runtime.evaluate(memory, state);

    await runtime.processActions(memory, [responseMessage], state, async () => {
      return [memory];
    });

    return response;
  }

  public registerAgent(runtime: AgentRuntime) {
    this.agents.set(runtime.agentId, runtime);
  }

  public unregisterAgent(runtime: AgentRuntime) {
    this.agents.delete(runtime.agentId);
  }
}
