const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v1/voices';
const GOOGLE_VOICES = [
  {
    id: 'google:Kore',
    name: 'Kore',
    category: 'google-ai',
    labels: {
      descriptive: 'firm',
      use_case: 'story',
      gender: 'female',
    },
    previewUrl: '',
  },
  {
    id: 'google:Puck',
    name: 'Puck',
    category: 'google-ai',
    labels: {
      descriptive: 'upbeat',
      use_case: 'social',
      gender: 'male',
    },
    previewUrl: '',
  },
  {
    id: 'google:Charon',
    name: 'Charon',
    category: 'google-ai',
    labels: {
      descriptive: 'informative',
      use_case: 'narration',
      gender: 'male',
    },
    previewUrl: '',
  },
  {
    id: 'google:Leda',
    name: 'Leda',
    category: 'google-ai',
    labels: {
      descriptive: 'youthful',
      use_case: 'story',
      gender: 'female',
    },
    previewUrl: '',
  },
  {
    id: 'google:Aoede',
    name: 'Aoede',
    category: 'google-ai',
    labels: {
      descriptive: 'breezy',
      use_case: 'social',
      gender: 'female',
    },
    previewUrl: '',
  },
  {
    id: 'google:Fenrir',
    name: 'Fenrir',
    category: 'google-ai',
    labels: {
      descriptive: 'excitable',
      use_case: 'story',
      gender: 'male',
    },
    previewUrl: '',
  },
];

const DEFAULT_VOICE = {
  id: 'google:Kore',
  name: 'Kore',
  category: 'google-ai',
  labels: {
    descriptive: 'firm',
    use_case: 'story',
    gender: 'female',
  },
  previewUrl: '',
};

function getUniqueApiKeys(...values) {
  const seen = new Set();

  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

async function loadElevenLabsVoices(apiKeys) {
  let firstError = null;

  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index];
    const response = await fetch(ELEVENLABS_VOICES_URL, {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    const payload = await response.json();

    if (response.ok) {
      return payload;
    }

    const error = new Error(payload.detail?.message || payload.detail || 'Failed to load voices.');
    firstError ||= error;

    if (index === apiKeys.length - 1) {
      if (firstError && firstError !== error) {
        throw new Error(
          `${firstError instanceof Error ? firstError.message : 'Primary ElevenLabs key failed.'} Fallback ElevenLabs key also failed. ${error instanceof Error ? error.message : 'Retry failed.'}`
        );
      }

      throw error;
    }
  }

  throw new Error('Failed to load voices.');
}

function fallbackPayload(warning) {
  return {
    voices: GOOGLE_VOICES,
    defaultVoiceId: DEFAULT_VOICE.id,
    fallback: true,
    warning,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKeys = getUniqueApiKeys(
    process.env.ELEVENLABS_API_KEY,
    process.env.ELEVENLABS_FALLBACK_API_KEY
  );
  const googleApiKey = process.env.GEMINI_API_KEY;

  if (!apiKeys.length) {
    res.status(200).json({
      ...(googleApiKey
        ? fallbackPayload(
            'ELEVENLABS_API_KEY is not configured. Google AI voices are available instead.'
          )
        : {
            voices: [DEFAULT_VOICE],
            defaultVoiceId: DEFAULT_VOICE.id,
            fallback: true,
            warning:
              'No voice provider is configured. OpenRouter handles text generation only; set ELEVENLABS_API_KEY, ELEVENLABS_FALLBACK_API_KEY, or GEMINI_API_KEY on the server for voice synthesis.',
          }),
    });
    return;
  }

  try {
    const payload = await loadElevenLabsVoices(apiKeys);

    const voices = Array.isArray(payload.voices)
      ? payload.voices
          .map((voice) => ({
            id: voice.voice_id,
            name: voice.name,
            category: voice.category || 'voice',
            labels: voice.labels || {},
            previewUrl: voice.preview_url || '',
          }))
          .filter((voice) => voice.id && voice.name)
          .sort((left, right) => left.name.localeCompare(right.name))
      : [];

    if (!voices.length) {
      res.status(200).json(
        googleApiKey
          ? fallbackPayload('ElevenLabs returned no voices. Showing Google AI voices instead.')
          : {
              voices: [DEFAULT_VOICE],
              defaultVoiceId: DEFAULT_VOICE.id,
              fallback: true,
              warning: 'ElevenLabs returned no voices.',
            }
      );
      return;
    }

    res.status(200).json({
      voices,
      defaultVoiceId: voices[0]?.id || DEFAULT_VOICE.id,
    });
  } catch (error) {
    res.status(200).json({
      ...(googleApiKey
        ? fallbackPayload(
            error instanceof Error
              ? `${error.message} Google AI voices are available instead.`
              : 'Failed to load ElevenLabs voices. Google AI voices are available instead.'
          )
        : {
            voices: [DEFAULT_VOICE],
            defaultVoiceId: DEFAULT_VOICE.id,
            fallback: true,
            warning: error instanceof Error ? error.message : 'Failed to load ElevenLabs voices.',
          }),
    });
  }
}
