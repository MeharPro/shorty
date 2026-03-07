import { Transformation } from '@cloudinary/url-gen';
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

const GAMEPLAY_HEIGHT_RATIO = 0.48;

function isRemoteAsset(asset: MediaAsset): boolean {
  return asset.strategy === 'remote-fetch' || asset.source === 'remote';
}

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
    strategy: 'cloudinary-public-id',
    resourceType: 'video',
    duration: result.duration,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    createdAt: result.created_at,
  };
}

export function createRemoteMediaAsset(url: string, label: string): MediaAsset {
  const trimmed = url.trim();

  return {
    id: `remote-${btoa(trimmed).replace(/=+$/g, '')}`,
    label,
    publicId: '',
    secureUrl: trimmed,
    source: 'remote',
    strategy: 'remote-fetch',
    resourceType: 'video',
  };
}

export function buildPlayableSourceUrl(asset: MediaAsset): string {
  if (isRemoteAsset(asset)) {
    return asset.secureUrl;
  }

  return cld
    .video(asset.publicId)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildGameplayOverlay(asset: MediaAsset, platform: PlatformPreset) {
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
  sourceAsset: MediaAsset,
  gameplayAsset: MediaAsset | null,
  draft: CreatorDraft,
  platform: PlatformPreset
) {
  const render = cld
    .video(sourceAsset.publicId)
    .videoEdit(trim().startOffset(draft.startOffset).duration(draft.clipDuration))
    .resize(
      fill()
        .width(platform.width)
        .height(platform.height)
        .gravity(autoGravity())
    );

  if (draft.includeGameplay && gameplayAsset) {
    render.overlay(buildGameplayOverlay(gameplayAsset, platform));
  }

  return render;
}

function buildPosterUrl(
  sourceAsset: MediaAsset,
  gameplayAsset: MediaAsset | null,
  draft: CreatorDraft,
  platform: PlatformPreset
): string {
  if (draft.includeGameplay && gameplayAsset && isRemoteAsset(gameplayAsset)) {
    // Remote fetch layers can be slower to materialize; keep previews responsive.
    return cld
      .video(sourceAsset.publicId)
      .videoEdit(trim().startOffset(draft.startOffset))
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

  return buildRenderableVideo(sourceAsset, gameplayAsset, draft, platform)
    .resize(
      fill()
        .width(PREVIEW_FRAME.width)
        .height(PREVIEW_FRAME.height)
        .gravity(autoGravity())
    )
    .format('jpg')
    .toURL();
}

function buildDeliveryUrl(
  sourceAsset: MediaAsset,
  gameplayAsset: MediaAsset | null,
  draft: CreatorDraft,
  platform: PlatformPreset
): string {
  return buildRenderableVideo(sourceAsset, gameplayAsset, draft, platform)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildAiPreviewUrl(
  sourceAsset: MediaAsset,
  draft: CreatorDraft,
  platform: PlatformPreset
): string {
  return cld
    .video(sourceAsset.publicId)
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
  const splitMarker = publicId ? `/${publicId}` : '/';
  const end = rest.lastIndexOf(splitMarker);
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
  const isGameplayComposite = Boolean(draft.includeGameplay && gameplayAsset);
  const deliveryUrl = buildDeliveryUrl(
    sourceAsset,
    isGameplayComposite ? gameplayAsset : null,
    draft,
    platform
  );
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

  if (isGameplayComposite && gameplayAsset) {
    summary.push(`Gameplay composite active from ${gameplayAsset.label}`);
    if (isRemoteAsset(gameplayAsset)) {
      summary.push('Gameplay is being fetched from a direct remote MP4 URL');
    } else {
      summary.push('Gameplay is layered from a Cloudinary-hosted gameplay asset');
    }
  }

  if (draft.useAiPreview) {
    summary.push('AI highlight preview URL generated for sponsor-side demoing');
    if (isGameplayComposite) {
      summary.push('AI preview is source-first and does not yet include gameplay compositing');
    }
  }

  return {
    id: `${platform.id}-${sourceAsset.publicId || 'remote'}-${draft.startOffset}-${draft.clipDuration}`,
    platform,
    deliveryUrl,
    aiPreviewUrl,
    posterUrl: buildPosterUrl(
      sourceAsset,
      isGameplayComposite ? gameplayAsset : null,
      draft,
      platform
    ),
    transformationRecipe: extractTransformationRecipe(deliveryUrl, sourceAsset.publicId),
    transformationSummary: summary,
    captionLines: splitCaptionLines(draft.captionSeed, draft.headline),
    sourceLabel: sourceAsset.label,
    gameplayLabel: isGameplayComposite ? gameplayAsset?.label ?? null : null,
    compositionMode: isGameplayComposite ? 'gameplay-stack' : 'single',
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
      strategy: sourceAsset.strategy,
    },
    gameplayAsset: gameplayAsset
      ? {
          publicId: gameplayAsset.publicId,
          label: gameplayAsset.label,
          source: gameplayAsset.source,
          strategy: gameplayAsset.strategy,
          secureUrl: isRemoteAsset(gameplayAsset) ? gameplayAsset.secureUrl : undefined,
        }
      : null,
    settings: draft,
    exports: manifests.map((manifest) => ({
      platform: manifest.platform.id,
      label: manifest.platform.label,
      deliveryUrl: manifest.deliveryUrl,
      aiPreviewUrl: manifest.aiPreviewUrl,
      transformationRecipe: manifest.transformationRecipe,
      compositionMode: manifest.compositionMode,
      summary: manifest.transformationSummary,
    })),
  };
}
