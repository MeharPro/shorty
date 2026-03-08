import { ensureBrainrotGameplayAsset, GAMEPLAY_FILE } from '../lib/brainrotPipeline.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({
      error:
        'Gameplay prep is unavailable. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  try {
    const result = await ensureBrainrotGameplayAsset({ cloudName, apiKey, apiSecret });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes(GAMEPLAY_FILE)) {
      res.status(404).json({ error: error.message });
      return;
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to prepare the gameplay asset.',
    });
  }
}
