import { createRequire } from 'node:module';

export function isExpoPushToken(token: string): boolean {
  const expoRequire = createRequire(__filename);
  const expoSdk = expoRequire('expo-server-sdk') as { Expo: { isExpoPushToken(token: unknown): boolean } };
  return expoSdk.Expo.isExpoPushToken(token);
}
