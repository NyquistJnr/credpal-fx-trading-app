import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? 'default-secret',
  expiration: parseInt(process.env.JWT_EXPIRATION_SECONDS ?? '900', 10), // 15 mins
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'default-refresh-secret',
  refreshExpiration: parseInt(
    process.env.JWT_REFRESH_EXPIRATION_SECONDS ?? '604800',
    10,
  ), // 7 days
}));
