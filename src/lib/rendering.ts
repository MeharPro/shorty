import { fill } from '@cloudinary/url-gen/actions/resize';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { preview, trim } from '@cloudinary/url-gen/actions/videoEdit';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { autoGravity } from '@cloudinary/url-gen/qualifiers/gravity';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { cld } from '../cloudinary/config';
import type {
  CaptionTheme,
  CreatorDraft,
  MediaAsset,
  PlatformPreset,
  RenderManifest,
  StoryPreset,
} from '../types';
import type { CloudinaryUploadResult } from '../cloudinary/UploadWidget';

const PREVIEW_FRAME = {
  width: 420,
  height: 748,
};

export function createMediaAssetFromUpload(
  result: CloudinaryUploadResult,
  label: string
): MediaAsset {
  return {
    id: result.asset_id ?? result.public_id,
    label,
    publicId: result.public_id,
    secureUrl: result.secure_url,
    source: 'upload',
    resourceType: 'video',
    duration: result.duration,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    createdAt: result.created_at,
  };
}

export function buildPlayableSourceUrl(asset: MediaAsset): string {
  return cld
    .video(asset.publicId)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildPosterUrl(asset: MediaAsset, startOffset: number): string {
  return cld
    .video(asset.publicId)
    .videoEdit(trim().startOffset(startOffset))
    .resize(
      fill()
        .width(PREVIEW_FRAME.width)
        .height(PREVIEW_FRAME.height)
        .gravity(autoGravity())
    )
    .delivery(quality(autoQuality()))
    .format('jpg')
    .toURL();
}

function buildDeliveryUrl(
  asset: MediaAsset,
  draft: CreatorDraft,
  platform: PlatformPreset
): string {
  return cld
    .video(asset.publicId)
    .videoEdit(trim().startOffset(draft.startOffset).duration(draft.clipDuration))
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

function buildAiPreviewUrl(
  asset: MediaAsset,
  draft: CreatorDraft,
  platform: PlatformPreset
): string {
  return cld
    .video(asset.publicId)
    .videoEdit(
      preview()
        .duration(draft.clipDuration)
        .maximumSegments(4)
        .minimumSegmentDuration(Math.max(2, Math.round(draft.clipDuration / 6)))
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

function splitCaptionLines(captionSeed: string, headline: string): string[] {
  const source = `${headline}. ${captionSeed}`.replace(/\s+/g, ' ').trim();
  if (!source) {
    return ['Add a hook line', 'and Cloudinary will carry the crop'];
  }

  const words = source.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > 24 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === 2) {
      break;
    }
  }

  if (current && lines.length < 2) {
    lines.push(current);
  }

  return lines.slice(0, 2);
}

function extractTransformationRecipe(url: string, publicId: string): string {
  const marker = '/upload/';
  const start = url.indexOf(marker);
  if (start === -1) {
    return '';
  }

  const rest = url.slice(start + marker.length);
  const splitMarker = `/${publicId}`;
  const end = rest.indexOf(splitMarker);
  return end === -1 ? rest : rest.slice(0, end);
}

export function buildPreviewManifest(
  sourceAsset: MediaAsset,
  gameplayAsset: MediaAsset | null,
  draft: CreatorDraft,
  platform: PlatformPreset,
  storyPreset: StoryPreset,
  captionTheme: CaptionTheme
): RenderManifest {
  const deliveryUrl = buildDeliveryUrl(sourceAsset, draft, platform);
  const aiPreviewUrl = draft.useAiPreview
    ? buildAiPreviewUrl(sourceAsset, draft, platform)
    : null;

  const summary = [
    `${storyPreset.label} active`,
    `Trim ${draft.clipDuration}s starting at ${draft.startOffset}s`,
    `Auto-crop to ${platform.width}x${platform.height} with Cloudinary gravity`,
    `Deliver with f_auto and q_auto for lighter social exports`,
    `Caption pack: ${captionTheme.label}`,
  ];

  if (draft.includeGameplay && gameplayAsset) {
    summary.push(`Gameplay bed staged from ${gameplayAsset.label}`);
  }
  if (draft.useAiPreview) {
    summary.push('AI highlight preview URL generated for sponsor-side demoing');
  }

  return {
    id: `${platform.id}-${sourceAsset.publicId}-${draft.startOffset}-${draft.clipDuration}`,
    platform,
    deliveryUrl,
    aiPreviewUrl,
    posterUrl: buildPosterUrl(sourceAsset, draft.startOffset),
    transformationRecipe: extractTransformationRecipe(deliveryUrl, sourceAsset.publicId),
    transformationSummary: summary,
    captionLines: splitCaptionLines(draft.captionSeed, draft.headline),
    sourceLabel: sourceAsset.label,
    gameplayLabel: draft.includeGameplay ? gameplayAsset?.label ?? null : null,
  };
}

export function buildManifestPayload(
  sourceAsset: MediaAsset,
  gameplayAsset: MediaAsset | null,
  draft: CreatorDraft,
  manifests: RenderManifest[]
): Record<string, unknown> {
  return {
    app: 'yt-shortmaker',
    generatedAt: new Date().toISOString(),
    sourceAsset: {
      publicId: sourceAsset.publicId,
      label: sourceAsset.label,
      source: sourceAsset.source,
    },
    gameplayAsset: gameplayAsset
      ? {
          publicId: gameplayAsset.publicId,
          label: gameplayAsset.label,
          source: gameplayAsset.source,
        }
      : null,
    settings: draft,
    exports: manifests.map((manifest) => ({
      platform: manifest.platform.id,
      label: manifest.platform.label,
      deliveryUrl: manifest.deliveryUrl,
      aiPreviewUrl: manifest.aiPreviewUrl,
      transformationRecipe: manifest.transformationRecipe,
      summary: manifest.transformationSummary,
    })),
  };
}
