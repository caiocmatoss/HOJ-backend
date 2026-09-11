const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { assertTestDatabaseUrl } = require('./test-database-guard.cjs');

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const testUrl = process.env.DATABASE_URL_TEST;
const databaseName = assertTestDatabaseUrl(testUrl);
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl };
console.log(`Integration database: ${databaseName}`);
const prismaCli = require.resolve('prisma/build/index.js');
const jestCli = path.join(process.cwd(), 'node_modules', 'jest', 'bin', 'jest.js');
run(process.execPath, [prismaCli, 'migrate', 'deploy'], env);
run(process.execPath, ['--experimental-vm-modules', jestCli, '--config', './test/jest-integration.json', '--runInBand'], env);
