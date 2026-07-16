import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

setup.describe.configure({ mode: 'serial' });

setup('initialize Clerk testing token', async () => {
  try {
    await clerkSetup({ dotenv: false });
  } catch {
    throw new Error('Clerk testing token setup failed.');
  }
});
