import { Cloudinary } from '@cloudinary/url-gen';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { fill } from '@cloudinary/url-gen/actions/resize';
import { preview, trim } from '@cloudinary/url-gen/actions/videoEdit';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { autoGravity } from '@cloudinary/url-gen/qualifiers/gravity';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';

const PLATFORMS = {
  'youtube-shorts': { width: 1080, height: 1920, label: 'YouTube Shorts' },
  'instagram-reels': { width: 1080, height: 1920, label: 'Instagram Reels' },
  tiktok: { width: 1080, height: 1920, label: 'TikTok' },
};

function buildDeliveryUrl(cld, publicId, clipDuration, startOffset, platform) {
  return cld
    .video(publicId)
    .videoEdit(trim().startOffset(startOffset).duration(clipDuration))
    .resize(
      fill()
        .width(platform.width)
        .height(platform.height)
        .gravity(autoGravity())
    )
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildAiPreviewUrl(cld, publicId, clipDuration, platform) {
  return cld
    .video(publicId)
    .videoEdit(
      preview()
        .duration(clipDuration)
        .maximumSegments(4)
        .minimumSegmentDuration(Math.max(2, Math.round(clipDuration / 6)))
    )
    .resize(
      fill()
        .width(platform.width)
        .height(platform.height)
        .gravity(autoGravity())
    )
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.VITE_CLOUDINARY_CLOUD_NAME ||
    'demo';
  const cld = new Cloudinary({
    cloud: { cloudName },
  });

  const publicId = body.publicId || 'dog';
  const clipDuration = Number(body.clipDuration || 15);
  const startOffset = Number(body.startOffset || 0);
  const useAiPreview = Boolean(body.useAiPreview);
  const platforms = Array.isArray(body.platforms) ? body.platforms : ['youtube-shorts'];

  const manifests = platforms
    .map((platformId) => PLATFORMS[platformId])
    .filter(Boolean)
    .map((platform) => ({
      platform: platform.label,
      deliveryUrl: buildDeliveryUrl(cld, publicId, clipDuration, startOffset, platform),
      aiPreviewUrl: useAiPreview
        ? buildAiPreviewUrl(cld, publicId, clipDuration, platform)
        : null,
    }));

  res.status(200).json({
    cloudName,
    publicId,
    clipDuration,
    startOffset,
    manifests,
    generatedAt: new Date().toISOString(),
  });
}
