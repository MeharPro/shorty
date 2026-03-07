import crypto from 'node:crypto';

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  return typeof body === 'string' ? JSON.parse(body || '{}') : body;
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    res.status(500).json({
      error:
        'Signed uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    });
    return;
  }

  const body = normalizeBody(req.body);
  const timestamp = Number(body.timestamp || Math.floor(Date.now() / 1000));
  const paramsToSign = {
    ...body.paramsToSign,
    timestamp,
  };

  const serialized = Object.entries(paramsToSign)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(`${serialized}${apiSecret}`)
    .digest('hex');

  res.status(200).json({
    cloudName,
    apiKey,
    timestamp,
    signature,
  });
}
