import { transcribeRemoteMedia } from '../lib/transcription.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const result = await transcribeRemoteMedia({
      sourceAsset: body.sourceAsset ?? null,
      googleDriveUrl: body.googleDriveUrl || '',
      language: body.language || '',
    });

    res.status(200).json({
      transcript: result.transcript,
      provider: result.provider,
      model: result.model,
      sourceUrl: result.sourceUrl,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to transcribe video.',
    });
  }
}
