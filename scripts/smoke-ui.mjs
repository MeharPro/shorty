#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { resolveGameplayUrl } from '../lib/gameplayResolver.js';

const port = process.env.SMOKE_PORT || '4173';
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}/`;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 25000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the Vite server is ready.
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function assertRenderable(url, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        range: 'bytes=0-0',
      },
    });

    if ([200, 206, 401].includes(response.status)) {
      return response.status;
    }

    if (response.status === 423 && attempt === attempts) {
      return response.status;
    }

    if (response.status !== 423) {
      throw new Error(`Unexpected render status ${response.status} for ${url}`);
    }

    await sleep(2000);
  }

  throw new Error(`Render never became ready for ${url}`);
}

const devServer = spawn(
  npmCommand,
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  }
);

devServer.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
});

devServer.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

let browser;
const fixtureServer = createServer((req, res) => {
  if (req.url === '/fixture') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
      <html lang="en">
        <head>
          <meta property="og:video" content="https://res.cloudinary.com/demo/video/upload/dog.mp4" />
          <title>Gameplay Fixture</title>
        </head>
        <body>
          <video controls src="https://res.cloudinary.com/demo/video/upload/dog.mp4"></video>
        </body>
      </html>`);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

try {
  await new Promise((resolve, reject) => {
    fixtureServer.once('error', reject);
    fixtureServer.listen(0, '127.0.0.1', resolve);
  });

  const fixtureAddress = fixtureServer.address();
  if (!fixtureAddress || typeof fixtureAddress === 'string') {
    throw new Error('Could not start the gameplay resolver fixture server.');
  }

  const resolverResult = await resolveGameplayUrl(
    `http://127.0.0.1:${fixtureAddress.port}/fixture`
  );
  if (
    resolverResult.mode !== 'scraped' ||
    resolverResult.resolvedUrl !== 'https://res.cloudinary.com/demo/video/upload/dog.mp4'
  ) {
    throw new Error('Gameplay resolver did not extract the expected direct video URL.');
  }

  await waitForServer(baseUrl);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-testid="preview-card"]');
  const previewCount = await page.locator('[data-testid="preview-card"]').count();
  if (previewCount !== 3) {
    throw new Error(`Expected 3 preview cards on first load, found ${previewCount}.`);
  }

  await page.getByTestId('preset-gameplay-stack').click();
  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="preview-card"]'));
    return cards.length > 0 && cards.every((card) => card.getAttribute('data-composition-mode') === 'gameplay-stack');
  });

  const compositeRenderUrl = await page
    .locator('[data-testid="preview-card"] [data-testid="render-link"]')
    .first()
    .getAttribute('href');

  if (!compositeRenderUrl) {
    throw new Error('Gameplay composite render URL was not generated.');
  }

  const renderStatus = await assertRenderable(compositeRenderUrl);

  await page.getByTestId('gameplay-remote-input').fill(
    'https://res.cloudinary.com/demo/video/upload/dog.mp4'
  );
  await page.getByTestId('attach-remote-gameplay-button').click();

  await page.waitForFunction(() => {
    return document.body.innerText.includes('Remote Gameplay Feed');
  });

  const screenshotPath = path.join(os.tmpdir(), 'shorty-smoke.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Smoke test passed. Composite render status: ${renderStatus}. Screenshot: ${screenshotPath}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => fixtureServer.close(resolve));

  if (!devServer.killed) {
    devServer.kill('SIGTERM');
    await sleep(500);
    if (!devServer.killed) {
      devServer.kill('SIGKILL');
    }
  }
}
