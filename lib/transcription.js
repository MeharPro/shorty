import { normalizeGoogleDriveUrl } from './reelPipeline.js';

const DEFAULT_TRANSCRIPTION_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1';
const MAX_DOWNLOAD_BYTES = 75 * 1024 * 1024;

function inferExtension(contentType) {
  if (!contentType) {
    return 'mp4';
  }

  if (contentType.includes('mpeg')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('quicktime')) return 'mov';
  return 'mp4';
}

export function getTranscriptionConfig() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_TRANSCRIPTION_BASE_URL;
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    model,
  };
}

export function resolveTranscriptSourceUrl({ sourceAsset, googleDriveUrl }) {
  if (googleDriveUrl) {
    return normalizeGoogleDriveUrl(googleDriveUrl);
  }

  if (sourceAsset?.secureUrl) {
    return sourceAsset.secureUrl;
  }

  return null;
}

export async function transcribeRemoteMedia({ sourceAsset, googleDriveUrl, language }) {
  const config = getTranscriptionConfig();
  if (!config.configured) {
    throw new Error('Transcription is not configured. Set OPENAI_API_KEY in your environment.');
  }

  const mediaUrl = resolveTranscriptSourceUrl({ sourceAsset, googleDriveUrl });
  if (!mediaUrl) {
    throw new Error('No media source was provided for transcription.');
  }

  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error(`Could not download source media for transcription (${mediaResponse.status}).`);
  }

  const contentLength = Number(mediaResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error('Source media is too large for synchronous transcription. Trim or compress it first.');
  }

  const mediaBuffer = await mediaResponse.arrayBuffer();
  if (mediaBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error('Source media is too large for synchronous transcription. Trim or compress it first.');
  }

  const contentType = mediaResponse.headers.get('content-type') || 'video/mp4';
  const extension = inferExtension(contentType);
  const formData = new FormData();
  const blob = new Blob([mediaBuffer], { type: contentType });

  formData.append('file', blob, `source.${extension}`);
  formData.append('model', config.model);
  formData.append('response_format', 'json');
  if (language) {
    formData.append('language', language);
  }

  const transcriptResponse = await fetch(`${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  const payload = await transcriptResponse.json().catch(() => ({}));
  if (!transcriptResponse.ok) {
    throw new Error(payload.error?.message || payload.message || 'Transcription provider request failed.');
  }

  const transcript = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!transcript) {
    throw new Error('Transcription provider returned an empty transcript.');
  }

  return {
    transcript,
    provider: 'openai-compatible',
    model: config.model,
    sourceUrl: mediaUrl,
  };
}
