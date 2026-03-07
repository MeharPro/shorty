import { Cloudinary } from '@cloudinary/url-gen';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { source } from '@cloudinary/url-gen/actions/overlay';
import { fill } from '@cloudinary/url-gen/actions/resize';
import { trim } from '@cloudinary/url-gen/actions/videoEdit';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { autoGravity, compass } from '@cloudinary/url-gen/qualifiers/gravity';
import { Position } from '@cloudinary/url-gen/qualifiers/position';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { text } from '@cloudinary/url-gen/qualifiers/source';
import { TextStyle } from '@cloudinary/url-gen/qualifiers/textStyle';
import { buildReelPlan, normalizeGoogleDriveUrl } from '../lib/reelPipeline.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeOverlayText(value) {
  return (value || '')
    .replace(/[^\w\s!?.,:'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function getAdaptiveFontSize(textValue, { base, floor }) {
  const length = sanitizeOverlayText(textValue).length;
  const overage = Math.max(0, length - 14);
  return Math.max(floor, Math.round(base - overage * 1.05));
}

function buildRemoteUrl({ cloudName, remoteUrl, startOffset, duration, format = 'mp4' }) {
  const transform = [
    `so_${startOffset}`,
    `du_${duration}`,
    'c_fill,g_auto,w_1080,h_1920',
    'f_auto',
    'q_auto',
  ].join(',');

  const extension = format === 'jpg' ? '.jpg' : '.mp4';
  return `https://res.cloudinary.com/${cloudName}/video/fetch/${transform}/${encodeURIComponent(remoteUrl)}${extension}`;
}

function buildRemotePreviewUrl({ cloudName, remoteUrl, startOffset, duration }) {
  const transform = [
    `so_${startOffset}`,
    `du_${duration}`,
    'f_auto',
    'q_auto',
  ].join(',');

  return `https://res.cloudinary.com/${cloudName}/video/fetch/${transform}/${encodeURIComponent(remoteUrl)}.mp4`;
}

function buildPublicClip({ cld, publicId, startOffset, duration, hook, captionLines, poster = false, editingOptions = {} }) {
  const { shakingCaptions = false } = editingOptions;
  const hookFontSize = getAdaptiveFontSize(hook, {
    base: shakingCaptions ? 72 : 58,
    floor: shakingCaptions ? 42 : 38,
  });
  const firstCaptionFontSize = getAdaptiveFontSize(captionLines?.[0], {
    base: shakingCaptions ? 56 : 42,
    floor: shakingCaptions ? 34 : 28,
  });
  const secondCaptionFontSize = getAdaptiveFontSize(captionLines?.[1], {
    base: shakingCaptions ? 48 : 42,
    floor: shakingCaptions ? 30 : 26,
  });

  const render = cld
    .video(publicId)
    .videoEdit(trim().startOffset(startOffset).duration(duration))
    .resize(fill().width(1080).height(1920).gravity(autoGravity()));

  if (hook && shakingCaptions) {
    // Shaking captions: larger, bolder, with background highlight for attention
    render.overlay(
      source(
        text(
          sanitizeOverlayText(hook),
          new TextStyle('Impact', hookFontSize).fontWeight('bold')
        ).textColor('#FFFF00').backgroundColor('#000000A0')
      ).position(new Position().gravity(compass('north')).offsetY(180))
    );
  } else if (hook) {
    render.overlay(
      source(
        text(sanitizeOverlayText(hook), new TextStyle('Arial', hookFontSize).fontWeight('bold')).textColor('white')
      ).position(new Position().gravity(compass('north')).offsetY(150))
    );
  }

  if (captionLines?.[0] && shakingCaptions) {
    render.overlay(
      source(
        text(
          sanitizeOverlayText(captionLines[0]),
          new TextStyle('Impact', firstCaptionFontSize).fontWeight('bold')
        ).textColor('#FFFFFF').backgroundColor('#8B5CF6CC')
      ).position(new Position().gravity(compass('south')).offsetY(200))
    );
    if (captionLines[1]) {
      render.overlay(
        source(
          text(
            sanitizeOverlayText(captionLines[1]),
            new TextStyle('Impact', secondCaptionFontSize).fontWeight('bold')
          ).textColor('#FFFFFF').backgroundColor('#8B5CF6CC')
        ).position(new Position().gravity(compass('south')).offsetY(130))
      );
    }
    } else if (captionLines?.[0]) {
      render.overlay(
        source(
          text(sanitizeOverlayText(captionLines[0]), new TextStyle('Arial', firstCaptionFontSize).fontWeight('bold')).textColor('white')
        ).position(new Position().gravity(compass('south')).offsetY(captionLines[1] ? 230 : 170))
      );

      if (captionLines[1]) {
        render.overlay(
          source(
            text(sanitizeOverlayText(captionLines[1]), new TextStyle('Arial', secondCaptionFontSize).fontWeight('bold')).textColor('white')
          ).position(new Position().gravity(compass('south')).offsetY(170))
        );
      }
    } else if (captionLines?.[1]) {
    render.overlay(
      source(
        text(sanitizeOverlayText(captionLines[1]), new TextStyle('Arial', secondCaptionFontSize).fontWeight('bold')).textColor('white')
      ).position(new Position().gravity(compass('south')).offsetY(170))
    );
  }

  if (poster) {
    return render.format('jpg').toURL();
  }

  return render.delivery(format('mp4')).delivery(quality(autoQuality())).toURL();
}

function buildPublicPreviewClip({ cld, publicId, startOffset, duration }) {
  return cld
    .video(publicId)
    .videoEdit(trim().startOffset(startOffset).duration(duration))
    .delivery(format('mp4'))
    .delivery(quality(autoQuality()))
    .toURL();
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo';
    const cld = new Cloudinary({ cloud: { cloudName } });

    const sourceAsset = body.sourceAsset ?? null;
    const googleDriveUrl = body.googleDriveUrl ? normalizeGoogleDriveUrl(body.googleDriveUrl) : null;
    const remoteUrl = googleDriveUrl || sourceAsset?.secureUrl || null;
    const sourceMode = googleDriveUrl || sourceAsset?.strategy === 'remote-fetch' ? 'remote-fetch' : 'cloudinary-public-id';
    const publicId = sourceAsset?.publicId || null;
    const duration = clamp(Number(body.duration || sourceAsset?.duration || 180), 30, 3600);
    const transcriptText = String(body.transcriptText || '').trim();
    const editingOptions = body.editingOptions ?? {};
    const visualAnalysis = body.visualAnalysis ?? null;

    if (!publicId && !remoteUrl) {
      res.status(400).json({ error: 'Provide either a Cloudinary video source or a Google Drive link.' });
      return;
    }

    const plan = buildReelPlan({ transcriptText, sourceDurationSeconds: duration, visualAnalysis });
    const clips = plan.clips.map((clip) => {
      const previewUrl = sourceMode === 'cloudinary-public-id' && publicId
        ? buildPublicPreviewClip({
          cld,
          publicId,
          startOffset: clip.startOffset,
          duration: clip.duration,
        })
        : buildRemotePreviewUrl({
          cloudName,
          remoteUrl,
          startOffset: clip.startOffset,
          duration: clip.duration,
        });

      const deliveryUrl = sourceMode === 'cloudinary-public-id' && publicId
        ? buildPublicClip({
          cld,
          publicId,
          startOffset: clip.startOffset,
          duration: clip.duration,
          hook: clip.hook,
          captionLines: clip.captionLines,
          editingOptions,
        })
        : buildRemoteUrl({
          cloudName,
          remoteUrl,
          startOffset: clip.startOffset,
          duration: clip.duration,
        });

      const posterUrl = sourceMode === 'cloudinary-public-id' && publicId
        ? buildPublicClip({
          cld,
          publicId,
          startOffset: clip.startOffset,
          duration: clip.duration,
          hook: clip.hook,
          captionLines: clip.captionLines,
          poster: true,
          editingOptions,
        })
        : buildRemoteUrl({
          cloudName,
          remoteUrl,
          startOffset: clip.startOffset,
          duration: clip.duration,
          format: 'jpg',
        });

      return {
        ...clip,
        previewUrl,
        deliveryUrl,
        posterUrl,
        downloadUrl: deliveryUrl,
        aiPreviewUrl: sourceMode === 'cloudinary-public-id' && publicId
          ? cld
            .video(publicId)
            .videoEdit(trim().startOffset(clip.startOffset).duration(clip.duration))
            .resize(fill().width(1080).height(1920).gravity(autoGravity()))
            .delivery(format('mp4'))
            .delivery(quality(autoQuality()))
            .toURL()
          : null,
      };
    });

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      source: {
        mode: sourceMode,
        publicId,
        secureUrl: remoteUrl,
        duration,
      },
      transcriptUsed: plan.transcriptUsed,
      visualSignalsUsed: plan.visualSignalsUsed,
      visualAnalysis: plan.visualAnalysis,
      recommendedClipId: clips[0]?.id ?? null,
      clips,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate reels.',
    });
  }
}
