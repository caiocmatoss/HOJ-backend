import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
export const MAX_PAGE_SIZE = 100;
export type Pagination = { page: number; limit: number; skip: number; take: number };
export type PaginatedResult<T> = { items: T[]; total: number };
export function parsePagination(page?: string, limit?: string): Pagination { const p = page === undefined ? 1 : Number(page); const l = limit === undefined ? 100 : Number(limit); if (!Number.isInteger(p) || p < 1) throw new BadRequestException('page deve ser um inteiro positivo.'); if (!Number.isInteger(l) || l < 1 || l > MAX_PAGE_SIZE) throw new BadRequestException(`limit deve ser um inteiro entre 1 e ${MAX_PAGE_SIZE}.`); return { page: p, limit: l, skip: (p - 1) * l, take: l }; }
export function setPaginationHeaders(response: Response, pagination: Pagination, total: number): void { response.setHeader('X-Page', String(pagination.page)); response.setHeader('X-Limit', String(pagination.limit)); response.setHeader('X-Total-Count', String(total)); response.setHeader('X-Total-Pages', String(Math.ceil(total / pagination.limit))); }