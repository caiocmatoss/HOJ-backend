export type PushDriver = 'disabled' | 'expo';
export type PushConfig = { driver: PushDriver; expoAccessToken?: string };

export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig {
  const driver = (env.PUSH_DRIVER || 'disabled').toLowerCase();
  if (driver !== 'disabled' && driver !== 'expo') throw new Error('PUSH_DRIVER must be disabled or expo');
  return { driver, expoAccessToken: env.EXPO_ACCESS_TOKEN || undefined };
}