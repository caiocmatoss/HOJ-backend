import { LocationsController } from './locations.controller';

describe('LocationsController preference identity', () => {
  it('uses the authenticated user instead of a client-supplied identity', async () => {
    const updatePreferences = jest.fn().mockResolvedValue({});
    const controller = new LocationsController({ updatePreferences } as any);

    await controller.updatePreferences(
      { user: { id: 'authenticated-user' } } as any,
      { shareWithFriends: false },
    );

    expect(updatePreferences).toHaveBeenCalledWith('authenticated-user', {
      shareWithFriends: false,
    });
    expect(updatePreferences).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: expect.anything() }),
    );
  });
});
