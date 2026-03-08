function getCloudinaryAdminConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  const apiKey = process.env.CLOUDINARY_API_KEY || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

  return {
    configured: Boolean(cloudName && apiKey && apiSecret),
    cloudName,
    apiKey,
    apiSecret,
  };
}

function buildBasicAuthHeader(apiKey, apiSecret) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

function encodePublicIdForDelivery(publicId) {
  return String(publicId || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildVideoThumbnailUrl(cloudName, publicId) {
  const encodedPublicId = encodePublicIdForDelivery(publicId);
  return `https://res.cloudinary.com/${cloudName}/video/upload/w_240,h_135,c_fill,so_0/${encodedPublicId}.jpg`;
}

function deriveSourceLabel(resource) {
  const explicitLabel =
    resource.display_name || resource.filename || resource.original_filename || '';

  if (explicitLabel) {
    return explicitLabel;
  }

  const publicId = String(resource.public_id || '').replace(/^\/+|\/+$/g, '');
  const leaf = publicId.split('/').pop() || 'Uploaded Video';
  return decodeURIComponent(leaf).replace(/[-_]+/g, ' ');
}

function isFeature1SourceVideo(resource) {
  if (!resource || typeof resource !== 'object') {
    return false;
  }

  if (resource.resource_type !== 'video' || resource.type !== 'upload') {
    return false;
  }

  const publicId = String(resource.public_id || '').trim().toLowerCase();
  if (!publicId || !publicId.includes('shorty')) {
    return false;
  }

  if (publicId.startsWith('shorty/brainrot/') || publicId.startsWith('shorty/feature1/')) {
    return false;
  }

  const segments = publicId.split('/').filter(Boolean);
  if (segments.length > 2) {
    return false;
  }

  return segments[0] === 'shorty' || segments[0]?.startsWith('shorty');
}

async function fetchVideoUploadsPage({
  cloudName,
  apiKey,
  apiSecret,
  prefix,
  maxResults,
  nextCursor,
}) {
  const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/video/upload`);
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('max_results', `${maxResults}`);

  if (nextCursor) {
    url.searchParams.set('next_cursor', nextCursor);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: buildBasicAuthHeader(apiKey, apiSecret),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error?.message || payload.message || 'Cloudinary asset listing failed.'
    );
  }

  return payload;
}

function normalizeSourceVideo(resource, cloudName) {
  return {
    id: resource.asset_id || resource.public_id,
    publicId: resource.public_id,
    secureUrl: resource.secure_url,
    label: deriveSourceLabel(resource),
    format: resource.format,
    bytes: Number(resource.bytes || 0) || undefined,
    width: Number(resource.width || 0) || undefined,
    height: Number(resource.height || 0) || undefined,
    duration: Number(resource.duration || 0) || undefined,
    createdAt: resource.created_at || undefined,
    thumbnailUrl: buildVideoThumbnailUrl(cloudName, resource.public_id),
  };
}

export async function listFeature1SourceVideos({ maxResults = 40 } = {}) {
  const config = getCloudinaryAdminConfig();
  if (!config.configured) {
    throw new Error(
      'Cloudinary source-video listing is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  const normalizedMaxResults = Math.min(100, Math.max(1, Number(maxResults) || 40));
  const collected = new Map();
  let nextCursor = null;
  let pageCount = 0;

  while (collected.size < normalizedMaxResults && pageCount < 10) {
    const payload = await fetchVideoUploadsPage({
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      prefix: 'shorty',
      maxResults: 100,
      nextCursor,
    });

    const resources = Array.isArray(payload.resources) ? payload.resources : [];
    resources.forEach((resource) => {
      if (!isFeature1SourceVideo(resource)) {
        return;
      }

      collected.set(resource.public_id, normalizeSourceVideo(resource, config.cloudName));
    });

    nextCursor = payload.next_cursor || null;
    pageCount += 1;

    if (!nextCursor || resources.length === 0) {
      break;
    }
  }

  return Array.from(collected.values())
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || '') || 0;
      const rightTime = Date.parse(right.createdAt || '') || 0;
      return rightTime - leftTime;
    })
    .slice(0, normalizedMaxResults);
}
