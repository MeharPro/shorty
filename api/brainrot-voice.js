import {
  buildAudioAssetResponse,
  createTemporaryMediaFile,
  getMediaDurationSeconds,
  removeTemporaryFile,
  slugify,
  uploadBufferToCloudinary,
} from '../lib/brainrotPipeline.js';

const DEFAULT_ELEVEN_MODEL = 'eleven_multilingual_v2';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  return typeof body === 'string' ? JSON.parse(body || '{}') : body;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateDurationSeconds(text, speed) {
  const wordCount = cleanText(text).split(' ').filter(Boolean).length;
  return Math.max(8, Math.round((wordCount / (2.6 * speed)) * 10) / 10);
}

function buildWordTimings(alignment) {
  if (
    !alignment ||
    !Array.isArray(alignment.characters) ||
    !Array.isArray(alignment.character_start_times_seconds) ||
    !Array.isArray(alignment.character_end_times_seconds)
  ) {
    return [];
  }

  const words = [];
  let currentText = '';
  let currentStart = null;
  let currentEnd = null;

  const flushWord = () => {
    const text = cleanText(currentText);

    if (!text || currentStart == null || currentEnd == null) {
      currentText = '';
      currentStart = null;
      currentEnd = null;
      return;
    }

    words.push({
      text,
      startSeconds: Math.max(0, Number(currentStart) || 0),
      endSeconds: Math.max(Number(currentStart) || 0, Number(currentEnd) || 0),
    });

    currentText = '';
    currentStart = null;
    currentEnd = null;
  };

  alignment.characters.forEach((character, index) => {
    const nextCharacter = String(character || '');
    const startSeconds = Number(alignment.character_start_times_seconds[index]);
    const endSeconds = Number(alignment.character_end_times_seconds[index]);

    if (!nextCharacter.trim()) {
      flushWord();
      return;
    }

    if (currentStart == null) {
      currentStart = Number.isFinite(startSeconds) ? startSeconds : endSeconds;
    }

    currentText += nextCharacter;
    currentEnd = Number.isFinite(endSeconds)
      ? endSeconds
      : Number.isFinite(startSeconds)
        ? startSeconds
        : currentEnd;
  });

  flushWord();

  return words;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVEN_MODEL;

  if (!apiKey) {
    res.status(500).json({
      error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
    });
    return;
  }

  if (!cloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    res.status(500).json({
      error:
        'Cloudinary audio uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  const body = normalizeBody(req.body);
  const text = cleanText(body.text);
  const voiceId = cleanText(body.voiceId) || DEFAULT_VOICE_ID;
  const seed = cleanText(body.seed || body.title || voiceId);
  const voiceSettings = {
    stability: clamp(body.voiceSettings?.stability, 0, 1, 0.45),
    similarity_boost: clamp(body.voiceSettings?.similarityBoost, 0, 1, 0.85),
    style: clamp(body.voiceSettings?.style, 0, 1, 0.2),
    speed: clamp(body.voiceSettings?.speed, 0.7, 1.2, 0.96),
    use_speaker_boost: Boolean(body.voiceSettings?.useSpeakerBoost ?? true),
  };

  if (!text) {
    res.status(400).json({ error: 'Provide a script before generating the voiceover.' });
    return;
  }

  let temporaryFilePath = null;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      let payload = {};

      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = { raw };
      }

      throw new Error(payload.detail?.message || payload.detail || payload.raw || 'ElevenLabs synthesis failed.');
    }

    const payload = await response.json();
    const audioBase64 = String(payload.audio_base64 || '').trim();

    if (!audioBase64) {
      throw new Error('ElevenLabs did not return audio for the voiceover.');
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    temporaryFilePath = await createTemporaryMediaFile(seed, 'mp3', audioBuffer);
    const measuredDuration =
      (await getMediaDurationSeconds(temporaryFilePath)) ||
      estimateDurationSeconds(text, voiceSettings.speed);
    const publicId = `shorty/brainrot/audio/${slugify(seed) || 'voice'}-${Date.now()}`;
    const alignment = payload.normalized_alignment || payload.alignment || null;
    const wordTimings = buildWordTimings(alignment);

    await uploadBufferToCloudinary({
      cloudName,
      apiKey: cloudinaryApiKey,
      apiSecret: cloudinaryApiSecret,
      buffer: audioBuffer,
      fileName: `${slugify(seed) || 'voice'}.mp3`,
      contentType: 'audio/mpeg',
      publicId,
      resourceType: 'video',
    });

    res.status(200).json({
      audioAsset: buildAudioAssetResponse(cloudName, publicId, measuredDuration),
      durationSeconds: measuredDuration,
      provider: 'elevenlabs',
      modelId,
      voiceId,
      alignment: wordTimings.length
        ? {
            sourceText: cleanText(
              Array.isArray(alignment?.characters) ? alignment.characters.join('') : text
            ),
            words: wordTimings,
          }
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create the voiceover.',
    });
  } finally {
    await removeTemporaryFile(temporaryFilePath);
  }
}
