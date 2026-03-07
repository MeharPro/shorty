#!/usr/bin/env node

import { resolveGameplayUrl } from '../lib/gameplayResolver.js';

const [, , rawUrl] = process.argv;

if (!rawUrl) {
  console.error('Usage: npm run resolve:gameplay -- <url>');
  process.exit(1);
}

try {
  const result = await resolveGameplayUrl(rawUrl);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown resolver failure.';
  console.error(message);
  process.exit(1);
}
