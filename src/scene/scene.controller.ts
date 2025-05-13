import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { SceneService } from './scene.service.js';

@Controller({ path: 'Scene' })
export class SceneController {
  constructor(private readonly sceneService: SceneService) {}
}
