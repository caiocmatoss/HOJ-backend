import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { MAX_PAGE_SIZE } from './pagination';
@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>(); const response = context.switchToHttp().getResponse<Response>();
    if (request.query.cursor !== undefined || (request.query.page === undefined && request.query.limit === undefined)) return next.handle();
    const page = request.query.page === undefined ? 1 : Number(request.query.page); const limit = request.query.limit === undefined ? 100 : Number(request.query.limit);
    if (!Number.isInteger(page) || page < 1) throw new BadRequestException('page deve ser um inteiro positivo.');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new BadRequestException(`limit deve ser um inteiro entre 1 e ${MAX_PAGE_SIZE}.`);
    return next.handle().pipe(map((body: unknown) => { if (!Array.isArray(body)) return body; const total = body.length; response.setHeader('X-Page', String(page)); response.setHeader('X-Limit', String(limit)); response.setHeader('X-Total-Count', String(total)); response.setHeader('X-Total-Pages', String(Math.ceil(total / limit))); return body.slice((page - 1) * limit, page * limit); }));
  }
}