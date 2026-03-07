import {
  buildSubtitleAssetResponse,
  slugify,
  uploadBufferToCloudinary,
} from '../lib/brainrotPipeline.js';

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  return typeof body === 'string' ? JSON.parse(body || '{}') : body;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function formatSrtTimestamp(totalSeconds) {
  const safeMilliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(safeMilliseconds / 3600000);
  const minutes = Math.floor((safeMilliseconds % 3600000) / 60000);
  const seconds = Math.floor((safeMilliseconds % 60000) / 1000);
  const milliseconds = safeMilliseconds % 1000;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':') + `,${String(milliseconds).padStart(3, '0')}`;
}

function splitCueLines(words) {
  if (words.length <= 4) {
    return words.join(' ');
  }

  const midpoint = Math.ceil(words.length / 2);
  return `${words.slice(0, midpoint).join(' ')}\n${words.slice(midpoint).join(' ')}`;
}

function splitIntoCueSegments(text, durationSeconds) {
  const words = cleanText(text).split(' ').filter(Boolean);

  if (!words.length) {
    return [];
  }

  const desiredCueCount = clamp(Math.round(durationSeconds / 2.2), 10, 42, 24);
  const targetWordsPerCue = clamp(Math.round(words.length / desiredCueCount), 3, 7, 5);
  const segments = [];
  let current = [];

  for (const word of words) {
    current.push(word);

    const hardStop = /[.!?]$/.test(word);
    const softPause = /[,;:]$/.test(word);
    const shouldFlush =
      current.length >= targetWordsPerCue &&
      (hardStop || current.length >= targetWordsPerCue + 2 || (softPause && current.length >= 3));

    if (shouldFlush) {
      segments.push([...current]);
      current = [];
    }
  }

  if (current.length) {
    segments.push(current);
  }

  return segments.map((segmentWords) => ({
    words: segmentWords,
    text: splitCueLines(segmentWords),
    wordCount: segmentWords.length,
  }));
}

function buildSrt(text, durationSeconds) {
  const segments = splitIntoCueSegments(text, durationSeconds);

  if (!segments.length) {
    throw new Error('Provide script text before generating captions.');
  }

  const totalWordCount = segments.reduce((sum, segment) => sum + segment.wordCount, 0);
  let cursorSeconds = 0;
  const lines = [];

  segments.forEach((segment, index) => {
    const segmentDuration =
      index === segments.length - 1
        ? Math.max(0.8, durationSeconds - cursorSeconds)
        : Math.max(0.8, (segment.wordCount / totalWordCount) * durationSeconds);
    const nextCursor =
      index === segments.length - 1
        ? durationSeconds
        : Math.min(durationSeconds, cursorSeconds + segmentDuration);

    lines.push(String(index + 1));
    lines.push(`${formatSrtTimestamp(cursorSeconds)} --> ${formatSrtTimestamp(nextCursor)}`);
    lines.push(segment.text);
    lines.push('');

    cursorSeconds = nextCursor;
  });

  return {
    srt: lines.join('\n').trim(),
    cueCount: segments.length,
  };
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
        'Cloudinary caption uploads are unavailable. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  const body = normalizeBody(req.body);
  const text = cleanText(body.text);
  const seed = cleanText(body.seed || body.title || 'brainrot-captions');
  const durationSeconds = clamp(body.durationSeconds, 6, 180, 60);

  if (!text) {
    res.status(400).json({ error: 'Provide the spoken script before generating captions.' });
    return;
  }

  try {
    const { srt, cueCount } = buildSrt(text, durationSeconds);
    const publicId = `shorty/brainrot/subtitles/${slugify(seed) || 'captions'}-${Date.now()}`;
    const upload = await uploadBufferToCloudinary({
      cloudName,
      apiKey,
      apiSecret,
      buffer: Buffer.from(srt, 'utf8'),
      fileName: `${slugify(seed) || 'captions'}.srt`,
      contentType: 'application/x-subrip',
      publicId,
      resourceType: 'raw',
    });
    const format = String(upload.format || 'srt').toLowerCase();

    res.status(200).json({
      subtitleAsset: buildSubtitleAssetResponse(
        cloudName,
        upload.public_id || publicId,
        format,
        cueCount,
        upload.secure_url
      ),
      provider: 'cloudinary',
      strategy: 'timed-srt-from-script',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate the caption track.',
    });
  }
}
