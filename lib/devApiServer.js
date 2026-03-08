import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import agentCommand from '../api/agent-command.js';
import brainrotAi from '../api/brainrot-ai.js';
import brainrotScript from '../api/brainrot-script.js';
import brainrotCaptions from '../api/brainrot-captions.js';
import brainrotIntroCard from '../api/brainrot-intro-card.js';
import brainrotVoice from '../api/brainrot-voice.js';
import brainrotVoices from '../api/brainrot-voices.js';
import feature1Agent from '../api/feature1-agent.js';
import feature1SourceVideos from '../api/feature1-source-videos.js';
import generateReels from '../api/generate-reels.js';
import gameplay from '../api/gameplay.js';
import health from '../api/health.js';
import transcribeVideo from '../api/transcribe-video.js';

const cwd = process.cwd();
let envLoaded = false;

const routes = new Map([
  ['/api/brainrot-ai', brainrotAi],
  ['/api/brainrot-script', brainrotScript],
  ['/api/brainrot-captions', brainrotCaptions],
  ['/api/brainrot-intro-card', brainrotIntroCard],
  ['/api/brainrot-voice', brainrotVoice],
  ['/api/brainrot-voices', brainrotVoices],
  ['/api/agent-command', agentCommand],
  ['/api/feature1-agent', feature1Agent],
  ['/api/feature1-source-videos', feature1SourceVideos],
  ['/api/generate-reels', generateReels],
  ['/api/gameplay', gameplay],
  ['/api/health', health],
  ['/api/transcribe-video', transcribeVideo],
]);

function loadEnvFile(fileName) {
  const filePath = path.resolve(cwd, fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadLocalEnv() {
  if (envLoaded) {
    return;
  }

  loadEnvFile('.env');
  loadEnvFile('.env.local');
  envLoaded = true;
}

function collectBody(req) {
  if (typeof req.body === 'string') {
    return Promise.resolve(req.body);
  }

  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(JSON.stringify(req.body));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

function attachHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
    }

    res.end(JSON.stringify(payload));
  };

  return res;
}

export async function handleApiRequest(req, res, options = {}) {
  const { send404 = true } = options;
  loadLocalEnv();

  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  const handler = routes.get(pathname);

  if (!handler) {
    if (!send404) {
      return false;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `No route registered for ${pathname}.` }));
    return true;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body == null) {
      req.body = await collectBody(req);
    }

    attachHelpers(res);
    await handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Local API server failed.',
      })
    );
  }

  return true;
}
