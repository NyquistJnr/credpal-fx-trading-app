import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET ?? 'default-secret',
  expiration: parseInt(process.env.JWT_EXPIRATION_SECONDS ?? '900', 10),
}));
