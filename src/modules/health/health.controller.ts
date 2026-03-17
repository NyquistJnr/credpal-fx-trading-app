import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisCacheService } from '../../common/services/redis-cache.service';

interface HealthStatus {
  status: 'healthy' | 'degraded';
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; latencyMs?: number };
    redis: { status: string; latencyMs?: number };
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly redisCache: RedisCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check for load balancers and monitoring' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is degraded' })
  async check(): Promise<HealthStatus> {
    const [dbCheck, redisCheck] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allHealthy = dbCheck.status === 'up' && redisCheck.status === 'up';

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck,
        redis: redisCheck,
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: string;
    latencyMs?: number;
  }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down' };
    }
  }

  private async checkRedis(): Promise<{
    status: string;
    latencyMs?: number;
  }> {
    const start = Date.now();
    try {
      await this.redisCache.set('health:ping', '1', 5);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down' };
    }
  }
}
