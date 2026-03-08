import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  buildAudioAssetResponse,
  createTemporaryMediaFile,
  getMediaDurationSeconds,
  removeTemporaryFile,
  slugify,
  uploadBufferToCloudinary,
} from '../lib/brainrotPipeline.js';

const runCommand = promisify(execFile);

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_ELEVEN_MODEL = 'eleven_multilingual_v2';
const DEFAULT_ELEVEN_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_GOOGLE_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_GOOGLE_VOICE = 'Kore';
const GOOGLE_PCM_SAMPLE_RATE = 24000;

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

function normalizeGoogleVoiceId(value) {
  const cleaned = cleanText(value).replace(/^google:/i, '');
  return cleaned || DEFAULT_GOOGLE_VOICE;
}

function isGoogleVoiceId(value) {
  return /^google:/i.test(cleanText(value));
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

function parseInlineAudioData(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return null;
  }

  const audioPart = parts.find((part) => part?.inlineData?.data);

  if (!audioPart?.inlineData?.data) {
    return null;
  }

  return {
    data: String(audioPart.inlineData.data).trim(),
    mimeType: String(audioPart.inlineData.mimeType || '').trim(),
  };
}

function buildGoogleSpeechPrompt(text, voiceSettings) {
  const pace =
    voiceSettings.speed >= 1.05 ? 'fast' : voiceSettings.speed <= 0.88 ? 'measured' : 'natural';
  const style =
    voiceSettings.style >= 0.45
      ? 'punchy and dramatic'
      : voiceSettings.style <= 0.12
        ? 'steady and conversational'
        : 'clean and engaging';
  const energy =
    voiceSettings.stability <= 0.35 ? 'slightly more expressive' : 'controlled and polished';

  return [
    'Read the transcript exactly as written.',
    `Delivery: ${pace}, ${style}, ${energy}, like a short-form creator voiceover.`,
    'Do not add words before or after the transcript.',
    `Transcript: ${text}`,
  ].join('\n');
}

async function transcodePcmToMp3(seed, pcmBuffer) {
  let pcmPath = null;
  let mp3Path = null;

  try {
    pcmPath = await createTemporaryMediaFile(seed, 'pcm', pcmBuffer);
    mp3Path = pcmPath.replace(/\.pcm$/i, '.mp3');

    await runCommand('ffmpeg', [
      '-y',
      '-f',
      's16le',
      '-ar',
      `${GOOGLE_PCM_SAMPLE_RATE}`,
      '-ac',
      '1',
      '-i',
      pcmPath,
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '2',
      mp3Path,
    ]);

    return readFile(mp3Path);
  } finally {
    await removeTemporaryFile(pcmPath);
    await removeTemporaryFile(mp3Path);
  }
}

async function uploadVoiceAsset({
  cloudName,
  apiKey,
  apiSecret,
  audioBuffer,
  seed,
  provider,
  modelId,
  voiceId,
  alignment = null,
  fallbackDurationSeconds,
  warning,
}) {
  let temporaryFilePath = null;

  try {
    temporaryFilePath = await createTemporaryMediaFile(seed, 'mp3', audioBuffer);
    const measuredDuration =
      (await getMediaDurationSeconds(temporaryFilePath)) || fallbackDurationSeconds || 0;
    const publicId = `shorty/brainrot/audio/${slugify(seed) || 'voice'}-${Date.now()}`;

    await uploadBufferToCloudinary({
      cloudName,
      apiKey,
      apiSecret,
      buffer: audioBuffer,
      fileName: `${slugify(seed) || 'voice'}.mp3`,
      contentType: 'audio/mpeg',
      publicId,
      resourceType: 'video',
    });

    return {
      audioAsset: {
        ...buildAudioAssetResponse(cloudName, publicId, measuredDuration),
        provider,
      },
      durationSeconds: measuredDuration,
      provider,
      modelId,
      voiceId,
      alignment,
      generatedAt: new Date().toISOString(),
      warning,
    };
  } finally {
    await removeTemporaryFile(temporaryFilePath);
  }
}

async function synthesizeWithElevenLabs({
  apiKey,
  modelId,
  text,
  voiceId,
  voiceSettings,
  seed,
  cloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
}) {
  const response = await fetch(
    `${ELEVENLABS_API_URL}/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
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

    throw new Error(
      payload.detail?.message || payload.detail || payload.raw || 'ElevenLabs synthesis failed.'
    );
  }

  const payload = await response.json();
  const audioBase64 = String(payload.audio_base64 || '').trim();

  if (!audioBase64) {
    throw new Error('ElevenLabs did not return audio for the voiceover.');
  }

  const alignment = payload.normalized_alignment || payload.alignment || null;
  const wordTimings = buildWordTimings(alignment);

  return uploadVoiceAsset({
    cloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    audioBuffer: Buffer.from(audioBase64, 'base64'),
    seed,
    provider: 'elevenlabs',
    modelId,
    voiceId,
    fallbackDurationSeconds: estimateDurationSeconds(text, voiceSettings.speed),
    alignment: wordTimings.length
      ? {
          sourceText: cleanText(
            Array.isArray(alignment?.characters) ? alignment.characters.join('') : text
          ),
          words: wordTimings,
        }
      : null,
  });
}

async function synthesizeWithGoogleAi({
  apiKey,
  modelId,
  text,
  voiceId,
  voiceSettings,
  seed,
  cloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  warning,
}) {
  const response = await fetch(`${GOOGLE_API_URL}/${modelId}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: buildGoogleSpeechPrompt(text, voiceSettings),
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: normalizeGoogleVoiceId(voiceId),
            },
          },
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Google AI speech synthesis failed.');
  }

  const inlineAudio = parseInlineAudioData(payload);

  if (!inlineAudio?.data) {
    throw new Error('Google AI did not return audio for the voiceover.');
  }

  const pcmBuffer = Buffer.from(inlineAudio.data, 'base64');
  const audioBuffer = await transcodePcmToMp3(seed, pcmBuffer);

  return uploadVoiceAsset({
    cloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    audioBuffer,
    seed,
    provider: 'google-ai',
    modelId,
    voiceId: `google:${normalizeGoogleVoiceId(voiceId)}`,
    fallbackDurationSeconds: estimateDurationSeconds(text, voiceSettings.speed),
    alignment: null,
    warning,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  const googleApiKey = process.env.GEMINI_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
  const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVEN_MODEL;
  const googleTtsModelId = process.env.GEMINI_TTS_MODEL || DEFAULT_GOOGLE_TTS_MODEL;

  if (!cloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    res.status(500).json({
      error:
        'Cloudinary audio uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  const body = normalizeBody(req.body);
  const text = cleanText(body.text);
  const requestedVoiceId = cleanText(body.voiceId);
  const voiceId = requestedVoiceId || DEFAULT_ELEVEN_VOICE_ID;
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

  const prefersGoogleVoice = isGoogleVoiceId(voiceId);

  try {
    if (prefersGoogleVoice) {
      if (!googleApiKey) {
        throw new Error('Google AI speech fallback is not configured. Set GEMINI_API_KEY on the server.');
      }

      const googleResponse = await synthesizeWithGoogleAi({
        apiKey: googleApiKey,
        modelId: googleTtsModelId,
        text,
        voiceId,
        voiceSettings,
        seed,
        cloudName,
        cloudinaryApiKey,
        cloudinaryApiSecret,
      });
      res.status(200).json(googleResponse);
      return;
    }

    if (elevenLabsApiKey) {
      try {
        const elevenResponse = await synthesizeWithElevenLabs({
          apiKey: elevenLabsApiKey,
          modelId: elevenLabsModelId,
          text,
          voiceId,
          voiceSettings,
          seed,
          cloudName,
          cloudinaryApiKey,
          cloudinaryApiSecret,
        });
        res.status(200).json(elevenResponse);
        return;
      } catch (elevenError) {
        if (!googleApiKey) {
          throw elevenError;
        }

        const googleResponse = await synthesizeWithGoogleAi({
          apiKey: googleApiKey,
          modelId: googleTtsModelId,
          text,
          voiceId: `google:${DEFAULT_GOOGLE_VOICE}`,
          voiceSettings,
          seed,
          cloudName,
          cloudinaryApiKey,
          cloudinaryApiSecret,
          warning: `ElevenLabs failed and Google AI TTS was used instead. ${elevenError instanceof Error ? elevenError.message : 'Fallback activated.'}`,
        });
        res.status(200).json(googleResponse);
        return;
      }
    }

    if (googleApiKey) {
      const googleResponse = await synthesizeWithGoogleAi({
        apiKey: googleApiKey,
        modelId: googleTtsModelId,
        text,
        voiceId: `google:${DEFAULT_GOOGLE_VOICE}`,
        voiceSettings,
        seed,
        cloudName,
        cloudinaryApiKey,
        cloudinaryApiSecret,
        warning: 'ElevenLabs is not configured. Google AI TTS was used for the voiceover.',
      });
      res.status(200).json(googleResponse);
      return;
    }

    res.status(500).json({
      error: 'No voice provider is configured. Set ELEVENLABS_API_KEY or GEMINI_API_KEY on the server.',
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create the voiceover.',
    });
  }
}
