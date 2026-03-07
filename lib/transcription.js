const TRANSCRIPTION_POLL_INTERVAL_MS = 2000;
const TRANSCRIPTION_TIMEOUT_MS = 180_000;

export function getTranscriptionConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  const apiKey = process.env.CLOUDINARY_API_KEY || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

  return {
    configured: Boolean(cloudName && apiKey && apiSecret),
    cloudName,
    apiKey,
    apiSecret,
  };
}

function encodePublicIdForDelivery(publicId) {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildTranscriptUrl(cloudName, publicId) {
  return `https://res.cloudinary.com/${cloudName}/raw/upload/${encodePublicIdForDelivery(`${publicId}.transcript`)}`;
}

function buildBasicAuthHeader(apiKey, apiSecret) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTimestamp(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function normalizeTranscriptSegments(segments) {
  if (!Array.isArray(segments)) {
    return '';
  }

  const timestampedLines = segments
    .map((segment) => {
      if (!segment || typeof segment !== 'object') {
        return null;
      }

      const transcript = typeof segment.transcript === 'string' ? segment.transcript.trim() : '';
      const firstWord = Array.isArray(segment.words) ? segment.words[0] : null;
      const startTime = firstWord && typeof firstWord.start_time === 'number' ? firstWord.start_time : null;

      if (!transcript) {
        return null;
      }

      return startTime === null ? transcript : `${formatTimestamp(startTime)} ${transcript}`;
    })
    .filter(Boolean);

  return timestampedLines.join('\n').trim();
}

function normalizeTranscriptPayload(payload) {
  const rawSegments = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.segments)
      ? payload.segments
      : [];

  return rawSegments
    .map((segment, index) => {
      if (!segment || typeof segment !== 'object') {
        return null;
      }

      const words = Array.isArray(segment.words)
        ? segment.words
          .map((word, wordIndex) => {
            if (!word || typeof word !== 'object') {
              return null;
            }

            const value = typeof word.word === 'string' ? word.word.trim() : '';
            if (!value) {
              return null;
            }

            const start = Number(word.start_time ?? word.start ?? 0);
            const end = Number(word.end_time ?? word.end ?? start + 0.3);

            return {
              id: `word-${index + 1}-${wordIndex + 1}`,
              word: value,
              start: Number.isFinite(start) ? start : 0,
              end: Number.isFinite(end) ? Math.max(end, start) : Math.max(start + 0.3, 0.3),
            };
          })
          .filter(Boolean)
        : [];

      const fallbackStart = words[0]?.start ?? Number(segment.start_time ?? segment.start ?? 0);
      const fallbackEnd = words[words.length - 1]?.end ?? Number(segment.end_time ?? segment.end ?? fallbackStart + 2);
      const text = typeof segment.transcript === 'string'
        ? segment.transcript.trim()
        : words.map((word) => word.word).join(' ').trim();

      if (!text) {
        return null;
      }

      return {
        id: `segment-${index + 1}`,
        text,
        start: Number.isFinite(fallbackStart) ? fallbackStart : 0,
        end: Number.isFinite(fallbackEnd) ? Math.max(fallbackEnd, fallbackStart) : Math.max(fallbackStart + 2, 2),
        confidence: typeof segment.confidence === 'number' ? segment.confidence : undefined,
        words,
      };
    })
    .filter(Boolean);
}

function extractTranscriptText(payload, fallbackText) {
  if (Array.isArray(payload)) {
    return normalizeTranscriptSegments(payload);
  }

  if (payload && typeof payload === 'object') {
    if (typeof payload.transcript === 'string' && payload.transcript.trim()) {
      return payload.transcript.trim();
    }

    if (Array.isArray(payload.segments)) {
      return normalizeTranscriptSegments(payload.segments);
    }
  }

  return fallbackText.trim();
}

function resolveTranscriptPublicId({ publicId, sourceAsset }) {
  if (typeof publicId === 'string' && publicId.trim()) {
    return publicId.trim();
  }

  if (typeof sourceAsset?.publicId === 'string' && sourceAsset.publicId.trim()) {
    return sourceAsset.publicId.trim();
  }

  return null;
}

async function requestCloudinaryTranscription({ cloudName, apiKey, apiSecret, publicId, language }) {
  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('type', 'upload');
  formData.append(
    'auto_transcription',
    language ? JSON.stringify({ original_language: language }) : 'true'
  );

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/explicit`, {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuthHeader(apiKey, apiSecret),
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error?.message || payload.message || 'Cloudinary could not start transcription for this asset.'
    );
  }

  return payload;
}

async function fetchTranscriptFromCloudinary(transcriptUrl) {
  const response = await fetch(transcriptUrl, {
    headers: {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      transcript: '',
    };
  }

  const rawText = await response.text();
  let parsed = null;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }

  return {
    ok: true,
    status: response.status,
    transcript: extractTranscriptText(parsed, rawText),
    segments: normalizeTranscriptPayload(parsed),
  };
}

async function waitForTranscript({ cloudName, publicId }) {
  const transcriptUrl = buildTranscriptUrl(cloudName, publicId);
  const deadline = Date.now() + TRANSCRIPTION_TIMEOUT_MS;
  let lastStatus = 0;

  while (Date.now() < deadline) {
    const result = await fetchTranscriptFromCloudinary(transcriptUrl);
    if (result.ok) {
      if (!result.transcript) {
        throw new Error('Cloudinary returned an empty transcript file.');
      }

      return {
        transcript: result.transcript,
        transcriptUrl,
        segments: result.segments,
      };
    }

    lastStatus = result.status;

    if (![0, 404, 420, 423, 425, 429].includes(result.status) && result.status < 500) {
      throw new Error('Cloudinary transcript file could not be retrieved.');
    }

    await sleep(TRANSCRIPTION_POLL_INTERVAL_MS);
  }

  throw new Error(
    lastStatus === 404
      ? 'Cloudinary transcription is still processing. Try again in a minute.'
      : 'Timed out while waiting for Cloudinary transcription to finish.'
  );
}

export async function transcribeRemoteMedia({ sourceAsset, googleDriveUrl, language, publicId }) {
  const config = getTranscriptionConfig();
  if (!config.configured) {
    throw new Error(
      'Cloudinary transcription is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  if (googleDriveUrl) {
    throw new Error('Feature 1 transcription now expects an existing Cloudinary video public ID.');
  }

  const resolvedPublicId = resolveTranscriptPublicId({ publicId, sourceAsset });
  if (!resolvedPublicId) {
    throw new Error('Enter a Cloudinary public ID to run transcription.');
  }

  await requestCloudinaryTranscription({
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    publicId: resolvedPublicId,
    language: typeof language === 'string' ? language.trim() : '',
  });

  const { transcript, transcriptUrl, segments } = await waitForTranscript({
    cloudName: config.cloudName,
    publicId: resolvedPublicId,
  });

  return {
    transcript,
    provider: 'cloudinary',
    model: 'auto_transcription',
    publicId: resolvedPublicId,
    sourceUrl: transcriptUrl,
    transcriptUrl,
    segments,
  };
}
