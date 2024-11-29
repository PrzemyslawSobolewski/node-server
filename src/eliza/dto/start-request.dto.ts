import { Character } from '@ai16z/eliza';
import { IsOptional } from 'class-validator';

export class StartRequestDto {
  @IsOptional()
  character?: Character;
}
