import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { defineConfig } from '@playwright/test';

const BROWSER_ORIGIN = 'http://localhost:3000';
const SERVER_READINESS_URL = `${BROWSER_ORIGIN}/favicon.svg`;
const repositoryRoot = resolve(process.cwd());
const isStandardLocalQa = process.env.QUICKFILL_STANDARD_QA === '1';
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? BROWSER_ORIGIN;
let parsedBaseUrl: URL;

try {
  parsedBaseUrl = new URL(configuredBaseUrl);
} catch {
  throw new Error('PLAYWRIGHT_BASE_URL must be a valid URL.');
}

const hasLocalHostname = ['localhost', '127.0.0.1'].includes(parsedBaseUrl.hostname);

if (
  hasLocalHostname &&
  (parsedBaseUrl.origin !== BROWSER_ORIGIN ||
    parsedBaseUrl.pathname !== '/' ||
    parsedBaseUrl.search !== '' ||
    parsedBaseUrl.hash !== '' ||
    parsedBaseUrl.username !== '' ||
    parsedBaseUrl.password !== '')
) {
  throw new Error(`Local Playwright runs must use ${BROWSER_ORIGIN}.`);
}

if (isStandardLocalQa && parsedBaseUrl.origin !== BROWSER_ORIGIN) {
  throw new Error(`Standard Playwright QA must use ${BROWSER_ORIGIN}.`);
}

const isLocal = parsedBaseUrl.origin === BROWSER_ORIGIN;

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

if (isLocal) {
  const projectRequire = createRequire(join(repositoryRoot, 'package.json'));
  const nextRequire = createRequire(projectRequire.resolve('next/package.json'));
  const { loadEnvConfig } = nextRequire('@next/env') as NextEnvironmentModule;

  try {
    loadEnvConfig(repositoryRoot, false, {
      info: () => undefined,
      error: () => undefined,
    });
  } catch {
    throw new Error('Unable to load the local Next.js environment with @next/env.');
  }

  const missingEnvironmentVariables = [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
  ].filter((name) => !process.env[name]);

  if (missingEnvironmentVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvironmentVariables.join(', ')}`,
    );
  }

  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_APP_URL = BROWSER_ORIGIN;
  process.env.NEXT_PUBLIC_APP_DOMAIN = 'localhost';
}

const webServerNodeOptions = [
  process.env.NODE_OPTIONS,
  '--dns-result-order=ipv4first',
]
  .filter((value): value is string => Boolean(value))
  .join(' ');

const temporaryRoot = resolve(tmpdir());
const outputDir = join(
  temporaryRoot,
  `quickfill-playwright-${process.pid}-${randomUUID()}`,
);

if (
  !isAbsolute(temporaryRoot) ||
  outputDir === repositoryRoot ||
  outputDir.startsWith(`${repositoryRoot}${sep}`)
) {
  throw new Error('Playwright output must remain outside the repository.');
}

export default defineConfig({
  testDir: './tests',
  outputDir,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  workers: isLocal ? 1 : undefined,
  use: {
    baseURL: parsedBaseUrl.origin,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: isLocal
    ? {
        command: 'pnpm exec next start --hostname localhost --port 3000',
        env: {
          NODE_OPTIONS: webServerNodeOptions,
        },
        url: SERVER_READINESS_URL,
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
  reporter: [['list']],
});
