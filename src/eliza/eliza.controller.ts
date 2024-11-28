import {
  Body,
  Controller,
  Param,
  Post,
  InternalServerErrorException,
} from '@nestjs/common';
import { ElizaService } from './eliza.service.js';
import { MessageRequestDto } from './dto/message-request.dto.js';

@Controller(':agentId')
export class ElizaController {
  constructor(private readonly elizaService: ElizaService) {
    this.elizaService.startAgents();
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
