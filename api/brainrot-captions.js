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
  return words.join(' ');
}

function normalizeWordTimings(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => ({
      text: cleanText(entry?.text),
      startSeconds: Number(entry?.startSeconds),
      endSeconds: Number(entry?.endSeconds),
    }))
    .filter(
      (entry) =>
        entry.text &&
        Number.isFinite(entry.startSeconds) &&
        Number.isFinite(entry.endSeconds) &&
        entry.endSeconds >= entry.startSeconds
    );
}

function splitIntoCueSegments(text, durationSeconds, maxWordsPerCue) {
  const words = cleanText(text).split(' ').filter(Boolean);

  if (!words.length) {
    return [];
  }

  const desiredCueCount = clamp(Math.round(durationSeconds / 2.2), 10, 42, 24);
  const safeMaxWordsPerCue = clamp(maxWordsPerCue, 2, 7, 4);
  const targetWordsPerCue = clamp(
    Math.round(words.length / desiredCueCount),
    2,
    safeMaxWordsPerCue,
    3
  );
  const segments = [];
  let current = [];

  for (const word of words) {
    current.push(word);

    const hardStop = /[.!?]$/.test(word);
    const softPause = /[,;:]$/.test(word);
    const shouldFlush =
      current.length >= targetWordsPerCue &&
      (hardStop || current.length >= safeMaxWordsPerCue || (softPause && current.length >= 2));

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

function splitAlignedCueSegments(wordTimings, maxWordsPerCue) {
  const safeMaxWordsPerCue = clamp(maxWordsPerCue, 2, 7, 4);
  const segments = [];
  let current = [];

  const flushCurrent = () => {
    if (!current.length) {
      return;
    }

    segments.push({
      text: splitCueLines(current.map((word) => word.text)),
      startSeconds: current[0].startSeconds,
      endSeconds: current[current.length - 1].endSeconds,
    });
    current = [];
  };

  wordTimings.forEach((word, index) => {
    current.push(word);

    const isLast = index === wordTimings.length - 1;
    const hardStop = /[.!?]$/.test(word.text);
    const softPause = /[,;:]$/.test(word.text);
    const nextWord = wordTimings[index + 1];
    const largeGap = nextWord ? nextWord.startSeconds - word.endSeconds > 0.34 : false;
    const shouldFlush =
      isLast ||
      current.length >= safeMaxWordsPerCue ||
      (hardStop && current.length >= 2) ||
      (softPause && current.length >= 2) ||
      (largeGap && current.length >= 2);

    if (shouldFlush) {
      flushCurrent();
    }
  });

  flushCurrent();
  return segments;
}

function shiftCueWindow(startSeconds, endSeconds, trimStartSeconds) {
  if (trimStartSeconds <= 0) {
    return { startSeconds, endSeconds };
  }

  if (endSeconds <= trimStartSeconds + 0.02) {
    return null;
  }

  const shiftedStart = Math.max(trimStartSeconds, startSeconds);
  const shiftedEnd = Math.max(shiftedStart + 0.12, endSeconds);

  return {
    startSeconds: shiftedStart,
    endSeconds: shiftedEnd,
  };
}

function buildSrt(text, durationSeconds, maxWordsPerCue, trimStartSeconds = 0) {
  const segments = splitIntoCueSegments(text, durationSeconds, maxWordsPerCue);

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

    const shiftedWindow = shiftCueWindow(cursorSeconds, nextCursor, trimStartSeconds);

    if (shiftedWindow) {
      lines.push(String(lines.length / 4 + 1));
      lines.push(
        `${formatSrtTimestamp(shiftedWindow.startSeconds)} --> ${formatSrtTimestamp(shiftedWindow.endSeconds)}`
      );
      lines.push(segment.text);
      lines.push('');
    }

    cursorSeconds = nextCursor;
  });

  if (!lines.length) {
    throw new Error('The opening card timing hides the entire caption track.');
  }

  return {
    srt: lines.join('\n').trim(),
    cueCount: lines.length / 4,
    strategy: 'timed-srt-from-script',
  };
}

function buildAlignedSrt(wordTimings, durationSeconds, maxWordsPerCue, trimStartSeconds = 0) {
  const segments = splitAlignedCueSegments(wordTimings, maxWordsPerCue);

  if (!segments.length) {
    throw new Error('Provide aligned word timings before generating captions.');
  }

  const safeDuration = Math.max(
    durationSeconds,
    segments[segments.length - 1]?.endSeconds || durationSeconds
  );
  const lines = [];

  segments.forEach((segment, index) => {
    const nextSegment = segments[index + 1];
    const startSeconds = Math.max(0, segment.startSeconds);
    const paddedEnd = Math.max(startSeconds + 0.28, segment.endSeconds + 0.08);
    const nextStart = nextSegment ? Math.max(startSeconds + 0.24, nextSegment.startSeconds - 0.02) : safeDuration;
    const endSeconds = Math.min(safeDuration, nextStart, paddedEnd);

    const shiftedWindow = shiftCueWindow(startSeconds, endSeconds, trimStartSeconds);

    if (shiftedWindow) {
      lines.push(String(lines.length / 4 + 1));
      lines.push(
        `${formatSrtTimestamp(shiftedWindow.startSeconds)} --> ${formatSrtTimestamp(shiftedWindow.endSeconds)}`
      );
      lines.push(segment.text);
      lines.push('');
    }
  });

  if (!lines.length) {
    throw new Error('The opening card timing hides the entire caption track.');
  }

  return {
    srt: lines.join('\n').trim(),
    cueCount: lines.length / 4,
    strategy: 'elevenlabs-aligned-srt',
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
  const maxWordsPerCue = clamp(body.maxWordsPerCue, 2, 7, 4);
  const trimStartSeconds = clamp(body.trimStartSeconds, 0, 12, 0);
  const wordTimings = normalizeWordTimings(body.wordTimings);

  if (!text) {
    res.status(400).json({ error: 'Provide the spoken script before generating captions.' });
    return;
  }

  try {
    const { srt, cueCount, strategy } = wordTimings.length
      ? buildAlignedSrt(wordTimings, durationSeconds, maxWordsPerCue, trimStartSeconds)
      : buildSrt(text, durationSeconds, maxWordsPerCue, trimStartSeconds);
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
      strategy,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate the caption track.',
    });
  }
}
