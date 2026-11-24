import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@chatterbox/shared';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        // Handle void/empty responses (e.g. 204 No Content)
        if (data === undefined || data === null) {
          return data;
        }

        // If the controller already returned an object with 'data', pass it through
        if (typeof data === 'object' && 'data' in data) {
          return data;
        }

        return { data };
      }),
    );
  }
}
