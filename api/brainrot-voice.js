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
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        output_format: 'mp3_44100_128',
        voice_settings: voiceSettings,
      }),
    });

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

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    temporaryFilePath = await createTemporaryMediaFile(seed, 'mp3', audioBuffer);
    const measuredDuration =
      (await getMediaDurationSeconds(temporaryFilePath)) ||
      estimateDurationSeconds(text, voiceSettings.speed);
    const publicId = `shorty/brainrot/audio/${slugify(seed) || 'voice'}-${Date.now()}`;

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
