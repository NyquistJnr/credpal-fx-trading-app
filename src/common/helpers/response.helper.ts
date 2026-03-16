import {
  ApiSuccessResponse,
  ApiPaginatedResponse,
  PaginatedMeta,
} from '../interfaces/api-response.interface';

export class ResponseHelper {
  static success<T>(data: T, message = 'Success'): ApiSuccessResponse<T> {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static paginated<T>(
    data: T[],
    meta: PaginatedMeta,
    message = 'Success',
  ): ApiPaginatedResponse<T> {
    return {
      success: true,
      message,
      data,
      meta,
      timestamp: new Date().toISOString(),
    };
  }
}
