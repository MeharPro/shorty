import { Cloudinary, Transformation } from '@cloudinary/url-gen';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { source } from '@cloudinary/url-gen/actions/overlay';
import { fill } from '@cloudinary/url-gen/actions/resize';
import { preview, trim } from '@cloudinary/url-gen/actions/videoEdit';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { autoGravity, compass } from '@cloudinary/url-gen/qualifiers/gravity';
import { Position } from '@cloudinary/url-gen/qualifiers/position';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import {
  fetch as fetchSource,
  video as videoSource,
} from '@cloudinary/url-gen/qualifiers/source';

const PLATFORMS = {
  'youtube-shorts': { id: 'youtube-shorts', width: 1080, height: 1920, label: 'YouTube Shorts' },
  'instagram-reels': {
    id: 'instagram-reels',
    width: 1080,
    height: 1920,
    label: 'Instagram Reels',
  },
  tiktok: { id: 'tiktok', width: 1080, height: 1920, label: 'TikTok' },
};

const GAMEPLAY_HEIGHT_RATIO = 0.48;

function isRemoteAsset(asset) {
  return asset?.strategy === 'remote-fetch' || asset?.source === 'remote';
}

function buildSourceVideo(cld, sourceAsset, sourcePublicId) {
  if (sourceAsset && isRemoteAsset(sourceAsset) && sourceAsset.secureUrl) {
    return cld.video(sourceAsset.secureUrl).setDeliveryType('fetch');
  }

  return cld.video(sourcePublicId);
}

function buildGameplayOverlay(asset, platform) {
  const overlayTransform = new Transformation().resize(
    fill()
      .width(platform.width)
      .height(Math.round(platform.height * GAMEPLAY_HEIGHT_RATIO))
      .gravity(compass('center'))
  );

  const gameplaySource = isRemoteAsset(asset)
    ? fetchSource(asset.secureUrl).transformation(overlayTransform)
    : videoSource(asset.publicId).transformation(overlayTransform);

  return source(gameplaySource).position(new Position().gravity(compass('south')));
}

function buildRenderableVideo(
  cld,
  sourceAsset,
  sourcePublicId,
  clipDuration,
  startOffset,
  platform,
  gameplayAsset
) {
  const render = buildSourceVideo(cld, sourceAsset, sourcePublicId)
    .videoEdit(trim().startOffset(startOffset).duration(clipDuration))
    .resize(
      fill()
        .width(platform.width)
        .height(platform.height)
        .gravity(autoGravity())
    );

  if (gameplayAsset) {
    render.overlay(buildGameplayOverlay(gameplayAsset, platform));
  }

  return render;
}

function buildDeliveryUrl(
  cld,
  sourceAsset,
  sourcePublicId,
  clipDuration,
  startOffset,
  platform,
  gameplayAsset
) {
  return buildRenderableVideo(
    cld,
    sourceAsset,
    sourcePublicId,
    clipDuration,
    startOffset,
    platform,
    gameplayAsset
  )
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildAiPreviewUrl(cld, sourceAsset, publicId, clipDuration, platform) {
  return buildSourceVideo(cld, sourceAsset, publicId)
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

  const sourceAsset = body.sourceAsset ?? null;
  const sourcePublicId = body.publicId || sourceAsset?.publicId || 'dog';
  const clipDuration = Number(body.clipDuration || body.settings?.clipDuration || 15);
  const startOffset = Number(body.startOffset || body.settings?.startOffset || 0);
  const useAiPreview = Boolean(body.useAiPreview ?? body.settings?.useAiPreview);
  const includeGameplay = Boolean(body.includeGameplay ?? body.settings?.includeGameplay);
  const gameplayAsset = includeGameplay ? body.gameplayAsset ?? null : null;
  const platforms = Array.isArray(body.platforms)
    ? body.platforms
    : Array.isArray(body.settings?.platforms)
      ? body.settings.platforms
      : ['youtube-shorts'];

  const manifests = platforms
    .map((platformId) => PLATFORMS[platformId])
    .filter(Boolean)
    .map((platform) => ({
      platform: platform.label,
      platformId: platform.id,
      deliveryUrl: buildDeliveryUrl(
        cld,
        sourceAsset,
        sourcePublicId,
        clipDuration,
        startOffset,
        platform,
        gameplayAsset
      ),
      aiPreviewUrl: useAiPreview
        ? buildAiPreviewUrl(cld, sourceAsset, sourcePublicId, clipDuration, platform)
        : null,
      compositionMode: gameplayAsset ? 'gameplay-stack' : 'single',
    }));

  res.status(200).json({
    cloudName,
    publicId: sourcePublicId,
    clipDuration,
    startOffset,
    includeGameplay: Boolean(gameplayAsset),
    gameplayAsset: gameplayAsset
      ? {
          publicId: gameplayAsset.publicId || null,
          secureUrl: gameplayAsset.secureUrl || null,
          source: gameplayAsset.source || null,
          strategy: gameplayAsset.strategy || null,
        }
      : null,
    manifests,
    generatedAt: new Date().toISOString(),
  });
}
