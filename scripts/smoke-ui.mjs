#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import feature1AgentHandler from '../api/feature1-agent.js';
import generateReelsHandler from '../api/generate-reels.js';

const port = Number(process.env.SMOKE_PORT || 4173);
const apiPort = Number(process.env.SMOKE_API_PORT || 3000);
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}/`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function waitForEndpoint(url, timeoutMs = 45000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the service is ready.
    }

    await sleep(300);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function buildWordTimings(text, start, end) {
  const words = text.split(/\s+/).filter(Boolean);
  const duration = Math.max(end - start, 0.6);
  const step = duration / Math.max(words.length, 1);

  return words.map((word, index) => ({
    word,
    start: Number((start + index * step).toFixed(2)),
    end: Number((start + (index + 1) * step).toFixed(2)),
  }));
}

function createSegment(id, text, start, end) {
  return {
    id,
    text,
    start,
    end,
    words: buildWordTimings(text, start, end),
  };
}

const smokeSession = {
  name: 'Smoke Tester',
  username: 'smoke_tester',
  userKey: 'smoke_tester',
  userId: 'smoke-user',
};

const smokeUpload = {
  id: 'upload-dog-demo',
  publicId: 'dog',
  secureUrl: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
  label: 'Demo speaker clip',
  duration: 95,
  thumbnailUrl: 'https://res.cloudinary.com/demo/video/upload/w_240,h_135,c_fill,so_0/dog.jpg',
  uploadedAt: '2026-03-07T12:00:00.000Z',
};

const smokeTranscript = {
  transcript: [
    '00:00 Here is the secret nobody tells you about going viral with short videos.',
    '00:24 The first three seconds have to land instantly or people keep scrolling.',
    '00:48 If the speaker is clear, the captions are tight, and the motion feels earned, retention jumps.',
  ].join('\n'),
  provider: 'smoke-fixture',
  model: 'smoke-fixture',
  transcriptUrl: '',
  generatedAt: '2026-03-07T12:00:00.000Z',
  segments: [
    createSegment(
      'seg-1',
      'Here is the secret nobody tells you about going viral with short videos.',
      0,
      12
    ),
    createSegment(
      'seg-2',
      'The first three seconds have to land instantly or people keep scrolling.',
      24,
      36
    ),
    createSegment(
      'seg-3',
      'If the speaker is clear, the captions are tight, and the motion feels earned, retention jumps.',
      48,
      66
    ),
  ],
};

const frontend = spawn(
  npmCommand,
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VERCEL_PORT: String(apiPort),
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  }
);

frontend.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
});

frontend.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

let browser;
let apiServer;

const routeHandlers = new Map([
  ['/api/generate-reels', generateReelsHandler],
  ['/api/feature1-agent', feature1AgentHandler],
]);

async function startApiServer() {
  apiServer = createServer(async (req, res) => {
    const requestPath = new URL(req.url || '/', apiBaseUrl).pathname;
    const handler = routeHandlers.get(requestPath);

    if (!handler) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const body = await parseBody(req);
    const response = {
      statusCode: 200,
      setHeader(name, value) {
        res.setHeader(name, value);
      },
      status(code) {
        this.statusCode = code;
        res.statusCode = code;
        return this;
      },
      json(payload) {
        if (!res.headersSent) {
          res.setHeader('content-type', 'application/json; charset=utf-8');
        }
        res.statusCode = this.statusCode;
        res.end(JSON.stringify(payload));
      },
      end(payload) {
        res.statusCode = this.statusCode;
        res.end(payload);
      },
    };

    try {
      await handler(
        {
          ...req,
          body,
        },
        response
      );
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Smoke API server failed.',
        })
      );
    }
  });

  await new Promise((resolve, reject) => {
    apiServer.once('error', reject);
    apiServer.listen(apiPort, '127.0.0.1', resolve);
  });
}

try {
  await startApiServer();

  await waitForEndpoint(baseUrl, 45000);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });

  await page.addInitScript(
    ({ session, upload, transcript }) => {
      window.localStorage.setItem('shorty.session', JSON.stringify(session));
      window.localStorage.setItem(`shorty:uploads:${session.userKey}:v1`, JSON.stringify([upload]));
      window.localStorage.setItem(
        `shorty:transcript:${session.userKey}:${upload.publicId}`,
        JSON.stringify(transcript)
      );
    },
    {
      session: smokeSession,
      upload: smokeUpload,
      transcript: smokeTranscript,
    }
  );

  await page.goto(new URL('/feature1', baseUrl).href, { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-testid="recent-upload-card"]', { timeout: 30000 });
  await page.locator('[data-testid="recent-upload-card"]').first().click();

  await page.waitForFunction(() => {
    const banner = document.querySelector('[data-testid="feature1-status-banner"]');
    return Boolean(banner?.textContent?.includes('Loaded'));
  });

  await page.getByTestId('feature1-next-transcribe').click();
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-testid="feature1-transcript"]');
    return input instanceof HTMLTextAreaElement && input.value.trim().length > 0;
  });

  await page.getByTestId('feature1-next-generate').click();
  await page.waitForSelector('[data-testid="feature1-agent-wish"]', { timeout: 30000 });
  await page
    .getByTestId('feature1-agent-wish')
    .fill(
      'Keep the active speaker fully visible, tighten captions so they fit, and push the top reel toward stronger hook energy without overdoing camera shake.'
    );
  await page.getByTestId('feature1-agent-apply').click();

  await page.waitForFunction(() => {
    const banner = document.querySelector('[data-testid="feature1-status-banner"]');
    return Boolean(banner?.textContent?.includes('Workflow agent updated Feature 1'));
  }, undefined, { timeout: 120000 });

  await page.getByTestId('feature1-generate').click();

  await page.waitForSelector('[data-testid="feature1-view-results"]', {
    timeout: 180000,
  });
  await page.getByTestId('feature1-view-results').click();

  await page.waitForSelector('[data-testid="feature1-reel-card"]', {
    timeout: 120000,
  });

  const cardCount = await page.locator('[data-testid="feature1-reel-card"]').count();
  const qaCount = await page.locator('[data-testid="feature1-reel-qa"]').count();

  if (cardCount < 1) {
    throw new Error('Expected at least one generated reel card.');
  }

  if (qaCount < 1) {
    throw new Error('Expected reel QA badges to be present after generation.');
  }

  const qaSummary = await page.locator('[data-testid="feature1-reel-qa"]').first().innerText();
  const screenshotPath = path.join(os.tmpdir(), 'shorty-feature1-smoke.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(
    `Smoke test passed. Reels: ${cardCount}. QA badges: ${qaCount}. First QA: ${qaSummary}. Screenshot: ${screenshotPath}`
  );
} finally {
  await browser?.close();

  if (apiServer?.listening) {
    await new Promise((resolve) => apiServer.close(resolve));
  }

  if (!frontend.killed) {
    frontend.kill('SIGTERM');
    await sleep(1000);
    if (!frontend.killed) {
      frontend.kill('SIGKILL');
    }
  }
}
