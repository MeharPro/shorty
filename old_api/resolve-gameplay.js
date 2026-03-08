import { resolveGameplayUrl } from '../lib/gameplayResolver.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const result = await resolveGameplayUrl(body.url);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not resolve gameplay URL.',
    });
  }
}
