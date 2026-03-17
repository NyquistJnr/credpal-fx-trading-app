import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /api/v1/health should return healthy status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      // Response is wrapped by TransformInterceptor: { success, data: { ... } }
      expect(res.body.success).toBe(true);

      const health = res.body.data;
      expect(health).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(health.status);
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('checks');
      expect(health.checks).toHaveProperty('database');
      expect(health.checks.database.status).toBe('up');
      expect(health.checks).toHaveProperty('redis');
      expect(health.checks.redis.status).toBe('up');
    });
  });

  describe('Auth', () => {
    it('POST /api/v1/auth/register should validate input', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('POST /api/v1/auth/login should reject missing credentials', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('Protected routes', () => {
    it('GET /api/v1/wallet should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/wallet').expect(401);
    });

    it('GET /api/v1/transactions should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .expect(401);
    });

    it('GET /api/v1/fx/rates should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/fx/rates').expect(401);
    });

    it('GET /api/v1/admin/users should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
    });
  });
});
