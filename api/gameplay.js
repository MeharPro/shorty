import crypto from 'node:crypto';

import {
  buildCloudinaryDeliveryUrl,
  ensureBrainrotGameplayAsset,
  GAMEPLAY_FILE,
  uploadBufferToCloudinary,
} from '../lib/brainrotPipeline.js';
import { isDirectVideoUrl, resolveGameplayUrl } from '../lib/gameplayResolver.js';

const PRESET_PUBLIC_IDS = {
  'satisfying-ice-cream': 'shorty/brainrot/remote-gameplay/satisfying-ice-cream',
  'satisfying-bubbles': 'shorty/brainrot/remote-gameplay/satisfying-bubbles',
  'satisfying-soap': 'shorty/brainrot/remote-gameplay/satisfying-soap',
  'satisfying-street-bubbles': 'shorty/brainrot/remote-gameplay/satisfying-street-bubbles',
};

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body !== 'string') {
    return body;
  }

  return JSON.parse(body || '{}');
}

function getCloudinaryConfig() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

function validateCloudinaryConfig(res, message) {
  const config = getCloudinaryConfig();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    res.status(500).json({
      error: message,
    });
    return null;
  }

  return config;
}

async function assetAlreadyUploaded(url) {
  const response = await fetch(url, { method: 'HEAD' });
  return response.ok;
}

function inferExtension(contentType, url) {
  if (contentType.includes('webm') || url.toLowerCase().endsWith('.webm')) {
    return 'webm';
  }

  return 'mp4';
}

async function handlePrepareLocalGameplay(res) {
  const config = validateCloudinaryConfig(
    res,
    'Gameplay prep is unavailable. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
  );

  if (!config) {
    return;
  }

  try {
    const result = await ensureBrainrotGameplayAsset(config);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes(GAMEPLAY_FILE)) {
      res.status(404).json({ error: error.message });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to prepare the gameplay asset.',
    });
  }
}

async function handlePrepareRemoteGameplay(body, res) {
  const config = validateCloudinaryConfig(
    res,
    'Remote gameplay prep is unavailable. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
  );

  if (!config) {
    return;
  }

  try {
    const remoteUrl = String(body.url || '').trim();
    const presetId = String(body.presetId || '').trim();
    const label = String(body.label || 'Remote Gameplay Feed').trim();
    const requestedDuration = Number(body.duration || 0);

    if (!remoteUrl) {
      res.status(400).json({ error: 'A remote gameplay URL is required.' });
      return;
    }

    const resolvedRemote =
      isDirectVideoUrl(remoteUrl) ? { resolvedUrl: remoteUrl } : await resolveGameplayUrl(remoteUrl);
    const resolvedUrl = resolvedRemote.resolvedUrl || remoteUrl;

    const publicId =
      PRESET_PUBLIC_IDS[presetId] ||
      `shorty/brainrot/remote-gameplay/${crypto
        .createHash('sha1')
        .update(resolvedUrl)
        .digest('hex')
        .slice(0, 24)}`;
    const canonicalUrl = buildCloudinaryDeliveryUrl(config.cloudName, publicId);
    const cached = await assetAlreadyUploaded(canonicalUrl);
    let upload = null;

    if (!cached) {
      const remoteResponse = await fetch(resolvedUrl);

      if (!remoteResponse.ok) {
        throw new Error(`Failed to download the remote gameplay clip (${remoteResponse.status}).`);
      }

      const contentType = remoteResponse.headers.get('content-type') || 'video/mp4';
      const extension = inferExtension(contentType, resolvedUrl);
      const buffer = Buffer.from(await remoteResponse.arrayBuffer());

      upload = await uploadBufferToCloudinary({
        cloudName: config.cloudName,
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        buffer,
        fileName: `${presetId || 'remote-gameplay'}.${extension}`,
        contentType,
        publicId,
        overwrite: true,
        resourceType: 'video',
      });
    }

    res.status(200).json({
      cached,
      asset: {
        id: presetId ? `preset-${presetId}` : publicId,
        label,
        publicId,
        secureUrl: upload?.secure_url || canonicalUrl,
        source: 'upload',
        strategy: 'cloudinary-public-id',
        resourceType: 'video',
        duration: Number(upload?.duration || requestedDuration || 0) || undefined,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to prepare the remote gameplay clip.',
    });
  }
}

async function handleResolveGameplay(body, res) {
  try {
    const result = await resolveGameplayUrl(body.url);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not resolve gameplay URL.',
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;

  try {
    body = normalizeBody(req.body);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid request body.',
    });
    return;
  }

  const action = String(body.action || '').trim();

  if (action === 'prepare-local') {
    await handlePrepareLocalGameplay(res);
    return;
  }

  if (action === 'prepare-remote') {
    await handlePrepareRemoteGameplay(body, res);
    return;
  }

  if (action === 'resolve-remote') {
    await handleResolveGameplay(body, res);
    return;
  }

  res.status(400).json({
    error: 'Unsupported action. Use "prepare-local", "prepare-remote", or "resolve-remote".',
  });
}
