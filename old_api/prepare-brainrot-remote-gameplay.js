import crypto from 'node:crypto';
import {
  buildCloudinaryDeliveryUrl,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({
      error:
        'Remote gameplay prep is unavailable. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  try {
    const body = normalizeBody(req.body);
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
    const canonicalUrl = buildCloudinaryDeliveryUrl(cloudName, publicId);
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
        cloudName,
        apiKey,
        apiSecret,
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
