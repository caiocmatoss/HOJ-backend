import { pushConfig } from './push-config';

describe('pushConfig', () => {
  it('defaults to disabled', () => expect(pushConfig({} as NodeJS.ProcessEnv)).toEqual({ driver: 'disabled', expoAccessToken: undefined }));
  it('accepts expo with optional access token', () => expect(pushConfig({ PUSH_DRIVER: 'expo', EXPO_ACCESS_TOKEN: 'placeholder' })).toEqual({ driver: 'expo', expoAccessToken: 'placeholder' }));
  it('rejects unknown driver', () => expect(() => pushConfig({ PUSH_DRIVER: 'firebase' })).toThrow());
});