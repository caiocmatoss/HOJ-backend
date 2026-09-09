import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
const PRIVATE_KEYS = new Set(['email','phone','passwordHash','emailVerifiedAt','authSessions','authRefreshTokens','authActionTokens']);
function sanitize(value: unknown): unknown { if (Array.isArray(value)) return value.map(sanitize); if (!value || typeof value !== 'object') return value; if (value instanceof Date || Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Object.prototype) return value; const output: Record<string, unknown> = {}; for (const [key, child] of Object.entries(value as Record<string, unknown>)) if (!PRIVATE_KEYS.has(key)) output[key] = sanitize(child); return output; }
// Defense-in-depth only; Prisma public selects remain the primary boundary.
@Injectable()
export class PublicPrivacyInterceptor implements NestInterceptor { intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> { const path = context.switchToHttp().getRequest<{ path?: string }>().path ?? ''; if (path.startsWith('/auth') || path === '/users/me') return next.handle(); return next.handle().pipe(map((body) => sanitize(body))); } }