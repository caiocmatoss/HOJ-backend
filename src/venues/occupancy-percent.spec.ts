import { getOccupancyPercent } from './occupancy-percent';

describe('getOccupancyPercent', () => {
  it.each([
    [0, null, null],
    [4, null, null],
    [4, 0, null],
    [0, 100, 0],
    [1, 100, 1],
    [40, 200, 20],
    [2, 3, 67],
    [120, 100, 120],
  ])('returns %s for occupancy=%s capacity=%s', (occupancy, capacity, expected) => {
    expect(getOccupancyPercent(occupancy, capacity)).toBe(expected);
  });
});