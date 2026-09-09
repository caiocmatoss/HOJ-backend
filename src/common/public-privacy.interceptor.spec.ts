import { PublicPrivacyInterceptor } from './public-privacy.interceptor';

describe('PublicPrivacyInterceptor', () => {
  it('removes private user fields recursively while preserving public fields', (done) => {
    const interceptor = new PublicPrivacyInterceptor();
    const next = { handle: () => require('rxjs').of([{ id: 'u', name: 'A', email: 'a@example.com', phone: '1', passwordHash: 'x', emailVerifiedAt: new Date(), status: 'ONLINE' }]) } as any;
    const context = { switchToHttp: () => ({ getRequest: () => ({ path: '/friends' }) }) } as any;
    interceptor.intercept(context, next).subscribe((value) => { expect(value).toEqual([{ id: 'u', name: 'A', status: 'ONLINE' }]); done(); });
  });
  it('does not alter self responses', (done) => {
    const interceptor = new PublicPrivacyInterceptor();
    const body = { email: 'a@example.com' };
    const next = { handle: () => require('rxjs').of(body) } as any;
    const context = { switchToHttp: () => ({ getRequest: () => ({ path: '/users/me' }) }) } as any;
    interceptor.intercept(context, next).subscribe((value) => { expect(value).toBe(body); done(); });
  });
});