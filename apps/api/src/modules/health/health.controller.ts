import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { HealthService } from './health.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(@Res() res: Response) {
    const { isHealthy, response } = await this.healthService.checkHealth();
    const status = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(status).json(response);
  }
}
