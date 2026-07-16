import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const SERVER_LISTENER_ORIGIN = 'http://127.0.0.1:3000';
const BROWSER_ORIGIN = 'http://localhost:3000';
const SERVER_READINESS_URL = `${SERVER_LISTENER_ORIGIN}/favicon.svg`;
const repositoryRoot = resolve(process.cwd());

type NextEnvironmentModule = {
  loadEnvConfig: (
    directory: string,
    development?: boolean,
    logger?: {
      info: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    },
  ) => unknown;
};

const projectRequire = createRequire(join(repositoryRoot, 'package.json'));
const nextRequire = createRequire(projectRequire.resolve('next/package.json'));
const { loadEnvConfig } = nextRequire('@next/env') as NextEnvironmentModule;

try {
  loadEnvConfig(repositoryRoot, false, {
    info: () => undefined,
    error: () => undefined,
  });
} catch {
  throw new Error('Unable to load .env.local with @next/env.');
}

if (!process.env.CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

const missingEnvironmentVariables = [
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
].filter((name) => !process.env[name]);

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvironmentVariables.join(', ')}`,
  );
}

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? BROWSER_ORIGIN;
let parsedBaseUrl: URL;

try {
  parsedBaseUrl = new URL(configuredBaseUrl);
} catch {
  throw new Error('PLAYWRIGHT_BASE_URL must use the approved browser origin.');
}

if (
  parsedBaseUrl.origin !== BROWSER_ORIGIN ||
  parsedBaseUrl.pathname !== '/' ||
  parsedBaseUrl.search !== '' ||
  parsedBaseUrl.hash !== '' ||
  parsedBaseUrl.username !== '' ||
  parsedBaseUrl.password !== ''
) {
  throw new Error('PLAYWRIGHT_BASE_URL must use the approved browser origin.');
}

process.env.PLAYWRIGHT_BASE_URL = BROWSER_ORIGIN;
process.env.NEXT_PUBLIC_APP_URL = BROWSER_ORIGIN;
process.env.NEXT_PUBLIC_APP_DOMAIN = 'localhost';

const webServerNodeOptions = [
  process.env.NODE_OPTIONS,
  '--dns-result-order=ipv4first',
]
  .filter((value): value is string => Boolean(value))
  .join(' ');

const temporaryRoot = resolve(tmpdir());
const outputDir = join(
  temporaryRoot,
  `quickfill-clerk-playwright-${process.pid}-${randomUUID()}`,
);

if (
  !isAbsolute(temporaryRoot) ||
  outputDir === repositoryRoot ||
  outputDir.startsWith(`${repositoryRoot}${sep}`)
) {
  throw new Error('Playwright output must remain outside the repository.');
}

export default defineConfig({
  testDir: './tests-clerk',
  outputDir,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list']],
  use: {
    baseURL: BROWSER_ORIGIN,
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'pnpm exec next start --hostname localhost --port 3000',
    env: {
      NODE_OPTIONS: webServerNodeOptions,
    },
    url: SERVER_READINESS_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'clerk-setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      testMatch: /homepage\.spec\.ts/,
      dependencies: ['clerk-setup'],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
