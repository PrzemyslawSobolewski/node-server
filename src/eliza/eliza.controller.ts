import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { ElizaService } from './eliza.service.js';
import { MessageRequestDto } from './dto/message-request.dto.js';
import { StartRequestDto } from './dto/start-request.dto.js';
import { UUID } from '@ai16z/eliza';
import { Response } from 'express';

@Controller(':agentId')
export class ElizaController {
  constructor(private readonly elizaService: ElizaService) {}

  @Post('start')
  async startAgent(
    @Param('agentId') agentId: UUID,
    @Body() startRequest: StartRequestDto,
  ) {
    const agent = await this.elizaService.startAgent(
      agentId,
      startRequest.character,
    );

    return {
      agentId: agent,
    };
  }

  @Post('message')
  async handleMessage(
    @Param('agentId') agentId: string,
    @Body() messageRequest: MessageRequestDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendChunk = (chunk: string) => {
      if (chunk) {
        res.write(`data: ${chunk}\n\n`);
      }
    };

    try {
      await this.elizaService.processMessageStream(
        agentId,
        messageRequest,
        sendChunk,
      );

      res.write(`data: ###END###\n\n`);
      res.end();
    } catch (error) {
      console.error('Error while streaming messages:', error);
      res.end();
    }
  }
}
