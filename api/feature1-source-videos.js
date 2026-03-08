import { listFeature1SourceVideos } from '../lib/cloudinaryAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const requestUrl = new URL(req.url || '/api/feature1-source-videos', 'http://127.0.0.1');
    const maxResults = Number(requestUrl.searchParams.get('max_results') || 40);
    const videos = await listFeature1SourceVideos({ maxResults });

    res.status(200).json({
      videos,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list Cloudinary source videos.',
    });
  }
}
