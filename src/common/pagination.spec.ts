import { BadRequestException } from '@nestjs/common';
import { parsePagination, setPaginationHeaders } from './pagination';

describe('pagination', () => {
  it('uses page 1 and limit 100 by default', () => expect(parsePagination()).toEqual({ page: 1, limit: 100, skip: 0, take: 100 }));
  it('accepts the maximum limit and computes skip', () => expect(parsePagination('3', '100')).toEqual({ page: 3, limit: 100, skip: 200, take: 100 }));
  it.each([['0', '10'], ['1', '101'], ['NaN', '10'], ['1', '0']])('rejects invalid values %s/%s', (page, limit) => expect(() => parsePagination(page, limit)).toThrow(BadRequestException));
  it('writes array-compatible pagination headers including zero totals', () => { const response = { setHeader: jest.fn() } as any; setPaginationHeaders(response, { page: 2, limit: 10, skip: 10 }, 0); expect(response.setHeader).toHaveBeenCalledWith('X-Total-Pages', '0'); });
});