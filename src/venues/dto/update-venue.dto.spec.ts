import { validate } from 'class-validator';
import { UpdateVenueDto } from './update-venue.dto';

describe('UpdateVenueDto capacity', () => {
  async function errors(capacity?: number | string | null) {
    const dto = new UpdateVenueDto();
    if (arguments.length > 0) dto.capacity = capacity as number | null;
    return validate(dto);
  }

  it('accepts a positive integer', async () => {
    expect((await errors(100)).filter((error) => error.property === 'capacity')).toHaveLength(0);
  });

  it('accepts null to remove capacity and omission leaves it unchanged', async () => {
    expect((await errors(null)).filter((error) => error.property === 'capacity')).toHaveLength(0);
    expect((await errors()).filter((error) => error.property === 'capacity')).toHaveLength(0);
  });

  it.each([0, -1, 1.5, "abc"])('rejects invalid capacity %s', async (capacity) => {
    expect((await errors(capacity)).some((error) => error.property === 'capacity')).toBe(true);
  });
});