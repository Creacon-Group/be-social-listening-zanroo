import { RequirePermission } from '../../common/permissions.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { type AuthUser, CurrentUser, Public } from '../../common/auth.js';
import { RateLimit } from '../../common/rate-limit.js';
import { bearer, sameSecret } from '../../common/secret.js';
import type { Env } from '../../config/env.js';
import { MentionFilterDto } from '../mentions/mention-filter.js';
import { InsightsService } from './insights.service.js';

class GenerateInsightDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MentionFilterDto)
  filter: MentionFilterDto = { range: '7d' };
}

@ApiTags('insights')
@Controller('projects/:projectId/insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @RequirePermission('insights.view')
  list(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.insights.list(projectId);
  }

  @Get(':insightId')
  @RequirePermission('insights.view')
  get(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('insightId', ParseIntPipe) insightId: number,
  ) {
    return this.insights.get(projectId, insightId);
  }

  /** Generates a briefing for the filter's period (20-60 s). Viewers can read, not generate. */
  @Post()
  @RequirePermission('insights.generate')
  @RateLimit(10)
  generate(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: GenerateInsightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.insights.generate(projectId, dto.filter, user.id);
  }
}

/** Vercel Cron (vercel.json), daily at 06:00 WIB, with "Authorization: Bearer $CRON_SECRET". */
@ApiTags('insights')
@Controller('cron')
export class InsightsCronController {
  constructor(
    private readonly insights: InsightsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('insights')
  run(@Headers('authorization') auth?: string) {
    const secret = this.config.get('CRON_SECRET', { infer: true });
    if (!secret)
      throw new ServiceUnavailableException('CRON_SECRET is not set');
    const given = bearer(auth);
    if (!given || !sameSecret(given, secret)) throw new UnauthorizedException();
    return this.insights.dailyCron();
  }
}
