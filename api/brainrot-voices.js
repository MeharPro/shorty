const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v1/voices';
const DEFAULT_VOICE = {
  id: '21m00Tcm4TlvDq8ikWAM',
  name: 'Rachel',
  category: 'premade',
  labels: {},
  previewUrl: '',
};

function fallbackPayload() {
  return {
    voices: [DEFAULT_VOICE],
    defaultVoiceId: DEFAULT_VOICE.id,
    fallback: true,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    res.status(200).json({
      ...fallbackPayload(),
      warning: 'ELEVENLABS_API_KEY is not configured on the server.',
    });
    return;
  }

  try {
    const response = await fetch(ELEVENLABS_VOICES_URL, {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail?.message || payload.detail || 'Failed to load voices.');
    }

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
      res.status(200).json(fallbackPayload());
      return;
    }

    res.status(200).json({
      voices,
      defaultVoiceId: voices[0]?.id || DEFAULT_VOICE.id,
    });
  } catch (error) {
    res.status(200).json({
      ...fallbackPayload(),
      warning: error instanceof Error ? error.message : 'Failed to load ElevenLabs voices.',
    });
  }
}
