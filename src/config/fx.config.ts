import { registerAs } from '@nestjs/config';

export default registerAs('fx', () => ({
  baseUrl: process.env.FX_API_BASE_URL,
  apiKey: process.env.FX_API_KEY,
  cacheTtl: parseInt(process.env.FX_RATE_CACHE_TTL ?? '300', 10),
  maxRateAge: parseInt(process.env.FX_MAX_RATE_AGE_SECONDS ?? '60', 10),
}));
