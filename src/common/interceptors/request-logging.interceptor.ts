import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLogger');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const correlationId = (req as any).correlationId ?? '-';
    const method = req.method;
    const path = req.originalUrl;
    const userId = (req as any).user?.id ?? 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            `[${correlationId}] ${method} ${path} → ${res.statusCode} (${duration}ms) user=${userId}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - start;
          const status = error?.status || error?.getStatus?.() || 500;
          this.logger.warn(
            `[${correlationId}] ${method} ${path} → ${status} (${duration}ms) user=${userId} error=${error.message}`,
          );
        },
      }),
    );
  }
}
