import {
  Body,
  Controller,
  Param,
  Post,
  InternalServerErrorException,
} from '@nestjs/common';
import { ElizaService } from './eliza.service.js';
import { MessageRequestDto } from './dto/message-request.dto.js';
import { StartRequestDto } from './dto/start-request.dto.js';
import { UUID } from '@ai16z/eliza';

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
  ) {
    const response = await this.elizaService.processMessage(
      agentId,
      messageRequest,
    );

    if (!response) {
      throw new InternalServerErrorException(
        'No response from generateMessageResponse',
      );
    }

    return response;
  }
}
