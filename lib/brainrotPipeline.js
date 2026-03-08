import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, openAsBlob } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const runCommand = promisify(execFile);

export const BRAINROT_CACHE_DIR = path.resolve(process.cwd(), '.cache/brainrot');
export const GAMEPLAY_FILE = path.resolve(
  process.cwd(),
  'src/assets/minecraft-gameplay.mp4'
);
export const GAMEPLAY_DERIVED_FILE = path.join(BRAINROT_CACHE_DIR, 'minecraft-gameplay.mp4');
export const GAMEPLAY_PUBLIC_ID = 'minecraft-gameplay';
export const GAMEPLAY_DERIVED_DURATION = 120;
export const GAMEPLAY_SOURCE_OFFSET = 30;

function ensureCacheDir() {
  mkdirSync(BRAINROT_CACHE_DIR, { recursive: true });
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildCloudinaryDeliveryUrl(
  cloudName,
  publicId,
  {
    extension = 'mp4',
    resourceType = 'video',
    transformation = extension === 'mp3' ? 'f_mp3,q_auto' : 'f_auto,q_auto',
  } = {}
) {
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${transformation}/${publicId}.${extension}`;
}

export function buildGameplayAssetResponse(cloudName) {
  return {
    id: GAMEPLAY_PUBLIC_ID,
    label: 'minecraft-gameplay',
    publicId: GAMEPLAY_PUBLIC_ID,
    secureUrl: buildCloudinaryDeliveryUrl(cloudName, GAMEPLAY_PUBLIC_ID),
    source: 'upload',
    strategy: 'cloudinary-public-id',
    resourceType: 'video',
    duration: GAMEPLAY_DERIVED_DURATION,
  };
}

export function buildAudioAssetResponse(cloudName, publicId, duration) {
  return {
    id: publicId,
    label: 'AI Voiceover',
    publicId,
    secureUrl: buildCloudinaryDeliveryUrl(cloudName, publicId, {
      extension: 'mp3',
      transformation: 'f_mp3,q_auto',
    }),
    duration,
    resourceType: 'video',
    provider: 'cloudinary',
  };
}

export function buildSubtitleAssetResponse(cloudName, publicId, format, cueCount, secureUrl) {
  const normalizedPublicId = publicId.endsWith(`.${format}`) ? publicId : `${publicId}.${format}`;

  return {
    id: normalizedPublicId,
    label: 'Timed captions',
    publicId: normalizedPublicId,
    secureUrl:
      secureUrl ||
      buildCloudinaryDeliveryUrl(cloudName, normalizedPublicId.replace(new RegExp(`\\.${format}$`), ''), {
        extension: format,
        resourceType: 'raw',
        transformation: '',
      }).replace('/upload//', '/upload/'),
    format,
    cueCount,
    resourceType: 'raw',
    provider: 'cloudinary',
  };
}

async function assetAlreadyUploaded(url) {
  const response = await fetch(url, { method: 'HEAD' });
  return response.ok;
}

export function signUpload(params, apiSecret) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
}

export async function ensureDerivedGameplayFile() {
  if (existsSync(GAMEPLAY_DERIVED_FILE)) {
    return GAMEPLAY_DERIVED_FILE;
  }

  ensureCacheDir();
  await runCommand('ffmpeg', [
    '-y',
    '-ss',
    `${GAMEPLAY_SOURCE_OFFSET}`,
    '-i',
    GAMEPLAY_FILE,
    '-t',
    `${GAMEPLAY_DERIVED_DURATION}`,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '32',
    '-movflags',
    '+faststart',
    GAMEPLAY_DERIVED_FILE,
  ]);

  return GAMEPLAY_DERIVED_FILE;
}

export async function uploadFileToCloudinary({
  cloudName,
  apiKey,
  apiSecret,
  filePath,
  fileName,
  contentType,
  publicId,
  overwrite = true,
  resourceType = 'video',
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: publicId,
    overwrite: overwrite ? 'true' : 'false',
    timestamp,
  };

  const signature = signUpload(params, apiSecret);
  const payload = new FormData();
  payload.append('file', await openAsBlob(filePath, { type: contentType }), fileName);
  payload.append('api_key', apiKey);
  payload.append('public_id', params.public_id);
  payload.append('overwrite', params.overwrite);
  payload.append('timestamp', `${timestamp}`);
  payload.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: payload,
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(data.error?.message || data.raw || 'Cloudinary upload failed.');
  }

  return data;
}

export async function uploadBufferToCloudinary({
  cloudName,
  apiKey,
  apiSecret,
  buffer,
  fileName,
  contentType,
  publicId,
  overwrite = true,
  resourceType = 'video',
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: publicId,
    overwrite: overwrite ? 'true' : 'false',
    timestamp,
  };

  const signature = signUpload(params, apiSecret);
  const payload = new FormData();
  payload.append('file', new Blob([buffer], { type: contentType }), fileName);
  payload.append('api_key', apiKey);
  payload.append('public_id', params.public_id);
  payload.append('overwrite', params.overwrite);
  payload.append('timestamp', `${timestamp}`);
  payload.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: payload,
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(data.error?.message || data.raw || 'Cloudinary upload failed.');
  }

  return data;
}

export async function ensureBrainrotGameplayAsset({ cloudName, apiKey, apiSecret }) {
  const canonicalUrl = buildCloudinaryDeliveryUrl(cloudName, GAMEPLAY_PUBLIC_ID);
  const cached = await assetAlreadyUploaded(canonicalUrl);

  if (!cached) {
    if (!existsSync(GAMEPLAY_FILE)) {
      throw new Error(`Gameplay file not found at ${GAMEPLAY_FILE}.`);
    }

    const derivedFile = await ensureDerivedGameplayFile();
    await uploadFileToCloudinary({
      cloudName,
      apiKey,
      apiSecret,
      filePath: derivedFile,
      fileName: 'minecraft-gameplay.mp4',
      contentType: 'video/mp4',
      publicId: GAMEPLAY_PUBLIC_ID,
    });
  }

  return {
    asset: buildGameplayAssetResponse(cloudName),
    cached,
  };
}

export async function createTemporaryMediaFile(prefix, extension, buffer) {
  ensureCacheDir();
  const filePath = path.join(
    BRAINROT_CACHE_DIR,
    `${slugify(prefix) || 'brainrot'}-${Date.now()}-${crypto.randomUUID()}.${extension}`
  );
  await writeFile(filePath, buffer);
  return filePath;
}

export async function getMediaDurationSeconds(filePath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const parsed = Number.parseFloat(stdout.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function removeTemporaryFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch {
    // Ignore cleanup failures in the cache directory.
  }
}
