import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (this.isStandardEnvelope(data)) {
          return data;
        }

        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }

  private isStandardEnvelope(data: unknown): boolean {
    return (
      data !== null &&
      typeof data === 'object' &&
      'success' in data &&
      'timestamp' in data &&
      'data' in data
    );
  }
}
