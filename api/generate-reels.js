import { Cloudinary } from '@cloudinary/url-gen';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { source } from '@cloudinary/url-gen/actions/overlay';
import { fill } from '@cloudinary/url-gen/actions/resize';
import { trim } from '@cloudinary/url-gen/actions/videoEdit';
import { autoGravity, compass } from '@cloudinary/url-gen/qualifiers/gravity';
import { focusOn as autoFocusOn } from '@cloudinary/url-gen/qualifiers/autoFocus';
import { Position } from '@cloudinary/url-gen/qualifiers/position';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { text } from '@cloudinary/url-gen/qualifiers/source';
import { solid } from '@cloudinary/url-gen/qualifiers/textStroke';
import { TextStyle } from '@cloudinary/url-gen/qualifiers/textStyle';
import { faces } from '@cloudinary/url-gen/qualifiers/focusOn';
import { buildSubtitleAssetResponse, slugify, uploadBufferToCloudinary } from '../lib/brainrotPipeline.js';
import { buildReelPlan, normalizeGoogleDriveUrl } from '../lib/reelPipeline.js';

const FEATURE1_CAPTION_STYLE = {
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundVisible: false,
  fontFamily: 'Impact',
  fontSize: 30,
  fontWeight: 'bold',
  strokeColor: '#000000',
  strokeWidth: 3,
  placement: 'center',
  horizontalOffset: 0,
  verticalOffset: 0,
};

const CAPTION_LINE_LIMIT = 14;
const CAPTION_MAX_LINES = 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeOverlayText(value) {
  return cleanText(value)
    .replace(/[^\w\s!?.,:'-]/g, ' ')
    .slice(0, 120);
}

function normalizeColor(value) {
  return `rgb:${String(value || '#0f172a').trim().replace(/^#/, '')}`;
}

function buildTextStyle(captionStyle, { includeStroke = true } = {}) {
  const textStyle = new TextStyle(captionStyle.fontFamily, captionStyle.fontSize).fontWeight(
    captionStyle.fontWeight
  );

  if (includeStroke && captionStyle.strokeWidth > 0) {
    textStyle.stroke(solid(captionStyle.strokeWidth, normalizeColor(captionStyle.strokeColor)));
  }

  return textStyle;
}

function serializeOverlayPublicId(publicId) {
  return String(publicId || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\//g, ':');
}

function resolveCaptionStyle(editingOptions = {}) {
  const shakingCaptions = editingOptions.shakingCaptions === true;

  return {
    ...FEATURE1_CAPTION_STYLE,
    fontSize: shakingCaptions ? 32 : FEATURE1_CAPTION_STYLE.fontSize,
    strokeWidth: shakingCaptions ? 4 : FEATURE1_CAPTION_STYLE.strokeWidth,
    maxWordsPerCue: editingOptions.captionDensity === 'tight' ? 2 : 3,
    maxCharsPerLine: editingOptions.captionDensity === 'tight' ? 12 : 14,
    maxLinesPerCue: CAPTION_MAX_LINES,
  };
}

function splitFallbackCaptionLines(lines, fallbackText) {
  const sourceText = cleanText((Array.isArray(lines) ? lines.join(' ') : '') || fallbackText);
  if (!sourceText) {
    return ['Watch this part'];
  }

  const words = sourceText.split(' ');
  const nextLines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > CAPTION_LINE_LIMIT && current) {
      nextLines.push(current);
      current = word;
    } else {
      current = candidate;
    }

    if (nextLines.length === CAPTION_MAX_LINES) {
      break;
    }
  }

  if (current && nextLines.length < CAPTION_MAX_LINES) {
    nextLines.push(current);
  }

  return nextLines.slice(0, CAPTION_MAX_LINES);
}

function wrapCaptionWordsIntoLines(words, maxCharsPerLine, maxLines) {
  const normalizedWords = Array.isArray(words)
    ? words.map((word) => cleanText(word)).filter(Boolean)
    : [];

  if (!normalizedWords.length) {
    return [];
  }

  const rows = [];
  let current = '';

  normalizedWords.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxCharsPerLine && current) {
      if (rows.length < maxLines - 1) {
        rows.push(current);
        current = word;
        return;
      }

      current = candidate;
      return;
    }

    current = candidate;
  });

  if (current && rows.length < maxLines) {
    rows.push(current);
  }

  return rows.slice(0, maxLines);
}

function buildCaptionLayers(line, captionStyle, offsetY) {
  const overlayText = sanitizeOverlayText(line) || 'Watch this part';
  const textSource = text(overlayText, buildTextStyle(captionStyle)).textColor(
    normalizeColor(captionStyle.textColor)
  );

  if (captionStyle.backgroundVisible) {
    textSource.backgroundColor(normalizeColor(captionStyle.backgroundColor));
  }

  return [
    source(textSource).position(
      new Position()
        .gravity(compass(captionStyle.placement))
        .offsetX(captionStyle.horizontalOffset)
        .offsetY(offsetY)
    ),
  ];
}

function buildTimedSubtitlesTransformations(subtitleAsset, captionStyle) {
  const sourceParts = [
    `co_${normalizeColor(captionStyle.textColor)}`,
    `l_subtitles:${buildTextStyle(captionStyle, { includeStroke: false }).toString()}:${serializeOverlayPublicId(subtitleAsset.publicId)}`,
  ];

  if (captionStyle.backgroundVisible) {
    sourceParts.push(`b_${normalizeColor(captionStyle.backgroundColor)}`);
  }

  if (captionStyle.strokeWidth > 0) {
    sourceParts.push(
      `bo_${captionStyle.strokeWidth}px_solid_${normalizeColor(captionStyle.strokeColor)}`
    );
  }

  return [
    `${sourceParts.join(',')}/fl_layer_apply,g_${captionStyle.placement},x_${captionStyle.horizontalOffset},y_${captionStyle.verticalOffset}`,
  ];
}

function buildFocusGravity(editingOptions = {}) {
  if (editingOptions.faceFocus === false) {
    return autoGravity();
  }

  return autoGravity().autoFocus(autoFocusOn(faces()));
}

function extractCloudNameFromUrl(url) {
  const match = String(url || '').match(/res\.cloudinary\.com\/([^/]+)\//i);
  return match?.[1] || null;
}

function extractCanonicalPublicId(url, cloudName) {
  const normalizedUrl = String(url || '');
  if (!normalizedUrl || !cloudName) {
    return null;
  }

  const escapedCloudName = cloudName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = normalizedUrl.match(
    new RegExp(`res\\.cloudinary\\.com/${escapedCloudName}/video/upload/(?:[^/]+/)*v\\d+/(.+)$`, 'i')
  );

  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/\.[^./?#]+(?:[?#].*)?$/, '');
}

function resolveSourceDescriptor({ sourceAsset, publicId, remoteUrl, sourceMode, cloudName }) {
  const sourceCloudName = extractCloudNameFromUrl(sourceAsset?.secureUrl || remoteUrl);
  const canonicalPublicId =
    extractCanonicalPublicId(sourceAsset?.secureUrl || remoteUrl, cloudName) || publicId;
  const useFetch =
    sourceMode === 'remote-fetch' ||
    sourceAsset?.strategy === 'remote-fetch' ||
    sourceAsset?.source === 'remote' ||
    (sourceCloudName && cloudName && sourceCloudName !== cloudName) ||
    !canonicalPublicId;

  return {
    publicId: canonicalPublicId,
    remoteUrl,
    useFetch,
  };
}

function createSourceVideo(cld, sourceDescriptor) {
  return sourceDescriptor.useFetch
    ? cld.video(sourceDescriptor.remoteUrl).setDeliveryType('fetch')
    : cld.video(sourceDescriptor.publicId);
}

function buildRenderableClip({
  cld,
  sourceDescriptor,
  startOffset,
  duration,
  editingOptions = {},
  subtitleAsset = null,
  captionLines = [],
  fallbackText = '',
}) {
  const captionStyle = resolveCaptionStyle(editingOptions);
  const render = createSourceVideo(cld, sourceDescriptor)
    .videoEdit(trim().startOffset(startOffset).duration(duration))
    .resize(fill().width(1080).height(1920).gravity(buildFocusGravity(editingOptions)));

  if (subtitleAsset?.publicId) {
    buildTimedSubtitlesTransformations(subtitleAsset, captionStyle).forEach((layer) => {
      render.addTransformation(layer);
    });
  } else {
    const lines = splitFallbackCaptionLines(captionLines, fallbackText);
    const lineOffset = Math.round(captionStyle.fontSize * 0.72);
    const blockStartOffset =
      captionStyle.verticalOffset - ((lines.length - 1) * lineOffset) / 2;

    lines.forEach((line, index) => {
      buildCaptionLayers(line, captionStyle, Math.round(blockStartOffset + index * lineOffset)).forEach(
        (layer) => {
          render.overlay(layer);
        }
      );
    });
  }

  return render;
}

function buildPreviewClip({ cld, sourceDescriptor, startOffset, duration }) {
  return createSourceVideo(cld, sourceDescriptor)
    .videoEdit(trim().startOffset(startOffset).duration(duration))
    .resize(fill().width(1080).height(1920).gravity(autoGravity().autoFocus(autoFocusOn(faces()))))
    .delivery(format('mp4'))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildPosterUrl(options) {
  return buildRenderableClip(options).format('jpg').toURL();
}

function buildDeliveryUrl(options) {
  return buildRenderableClip(options)
    .delivery(format('mp4'))
    .delivery(quality(autoQuality()))
    .toURL();
}

function buildAiPreviewUrl({ cld, sourceDescriptor, startOffset, duration, editingOptions = {} }) {
  return createSourceVideo(cld, sourceDescriptor)
    .videoEdit(trim().startOffset(startOffset).duration(duration))
    .resize(fill().width(1080).height(1920).gravity(buildFocusGravity(editingOptions)))
    .delivery(format('mp4'))
    .delivery(quality(autoQuality()))
    .toURL();
}

function normalizeTranscriptSegments(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((segment, segmentIndex) => {
      const text = cleanText(segment?.text);
      const start = Number(segment?.start);
      const end = Number(segment?.end);

      if (!text || !Number.isFinite(start) || !Number.isFinite(end)) {
        return null;
      }

      const words = Array.isArray(segment?.words)
        ? segment.words
            .map((word, wordIndex) => {
              const value = cleanText(word?.word || word?.text);
              const wordStart = Number(word?.start ?? word?.startSeconds);
              const wordEnd = Number(word?.end ?? word?.endSeconds);

              if (!value || !Number.isFinite(wordStart) || !Number.isFinite(wordEnd)) {
                return null;
              }

              return {
                id: `${segmentIndex + 1}-${wordIndex + 1}`,
                word: value,
                start: wordStart,
                end: Math.max(wordEnd, wordStart + 0.12),
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: String(segment?.id || `segment-${segmentIndex + 1}`),
        text,
        start,
        end: Math.max(end, start + 0.12),
        words,
      };
    })
    .filter(Boolean);
}

function expandSegmentWords(segment) {
  if (Array.isArray(segment.words) && segment.words.length > 0) {
    return segment.words;
  }

  const words = cleanText(segment.text).split(' ').filter(Boolean);
  if (!words.length) {
    return [];
  }

  const segmentDuration = Math.max(segment.end - segment.start, 0.5);
  const step = segmentDuration / Math.max(words.length, 1);

  return words.map((word, index) => ({
    word,
    start: segment.start + step * index,
    end: segment.start + step * (index + 1),
  }));
}

function extractClipWordTimings(segments, clipStart, clipDuration) {
  const clipEnd = clipStart + clipDuration;

  return segments
    .flatMap(expandSegmentWords)
    .map((word) => ({
      text: cleanText(word.word || word.text),
      startSeconds: Number(word.start ?? word.startSeconds),
      endSeconds: Number(word.end ?? word.endSeconds),
    }))
    .filter(
      (word) =>
        word.text &&
        Number.isFinite(word.startSeconds) &&
        Number.isFinite(word.endSeconds) &&
        word.endSeconds >= clipStart &&
        word.startSeconds <= clipEnd
    )
    .map((word) => {
      const startSeconds = clamp(word.startSeconds - clipStart, 0, clipDuration);
      const endSeconds = clamp(
        Math.max(word.endSeconds - clipStart, startSeconds + 0.12),
        startSeconds + 0.12,
        clipDuration
      );

      return {
        text: word.text,
        startSeconds,
        endSeconds,
      };
    });
}

function formatSrtTimestamp(totalSeconds) {
  const safeMilliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(safeMilliseconds / 3600000);
  const minutes = Math.floor((safeMilliseconds % 3600000) / 60000);
  const seconds = Math.floor((safeMilliseconds % 60000) / 1000);
  const milliseconds = safeMilliseconds % 1000;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':') + `,${String(milliseconds).padStart(3, '0')}`;
}

function splitAlignedCueSegments(wordTimings, maxWordsPerCue, maxCharsPerLine, maxLinesPerCue) {
  const safeMaxWordsPerCue = clamp(maxWordsPerCue, 2, 6);
  const safeMaxCharsPerLine = clamp(maxCharsPerLine, 8, 20);
  const safeMaxLinesPerCue = clamp(maxLinesPerCue, 1, 3);
  const safeMaxCharsPerCue = safeMaxCharsPerLine * safeMaxLinesPerCue;
  const segments = [];
  let current = [];

  const flushCurrent = () => {
    if (!current.length) {
      return;
    }

    segments.push({
      text: current.map((word) => word.text).join(' '),
      startSeconds: current[0].startSeconds,
      endSeconds: current[current.length - 1].endSeconds,
    });
    current = [];
  };

  wordTimings.forEach((word, index) => {
    const candidateWords = [...current, word];
    const candidateText = candidateWords.map((item) => item.text).join(' ');
    const exceedsCharBudget = candidateText.length > safeMaxCharsPerCue;

    if (current.length > 0 && exceedsCharBudget) {
      flushCurrent();
    }

    current.push(word);

    const isLast = index === wordTimings.length - 1;
    const hardStop = /[.!?]$/.test(word.text);
    const softPause = /[,;:]$/.test(word.text);
    const nextWord = wordTimings[index + 1];
    const largeGap = nextWord ? nextWord.startSeconds - word.endSeconds > 0.34 : false;
    const shouldFlush =
      isLast ||
      current.length >= safeMaxWordsPerCue ||
      (hardStop && current.length >= 2) ||
      (softPause && current.length >= 2) ||
      (largeGap && current.length >= 2);

    if (shouldFlush) {
      flushCurrent();
    }
  });

  flushCurrent();
  return segments;
}

function buildAlignedSrt(
  wordTimings,
  durationSeconds,
  maxWordsPerCue,
  maxCharsPerLine,
  maxLinesPerCue
) {
  const segments = splitAlignedCueSegments(
    wordTimings,
    maxWordsPerCue,
    maxCharsPerLine,
    maxLinesPerCue
  );

  if (!segments.length) {
    throw new Error('No timed transcript words were available for this clip.');
  }

  const safeDuration = Math.max(
    durationSeconds,
    segments[segments.length - 1]?.endSeconds || durationSeconds
  );
  const lines = [];

  segments.forEach((segment, index) => {
    const nextSegment = segments[index + 1];
    const startSeconds = Math.max(0, segment.startSeconds);
    const paddedEnd = Math.max(startSeconds + 0.28, segment.endSeconds + 0.08);
    const nextStart = nextSegment
      ? Math.max(startSeconds + 0.24, nextSegment.startSeconds - 0.02)
      : safeDuration;
    const endSeconds = Math.min(safeDuration, nextStart, paddedEnd);

    lines.push(String(lines.length / 4 + 1));
    lines.push(`${formatSrtTimestamp(startSeconds)} --> ${formatSrtTimestamp(endSeconds)}`);
    const wrappedText = wrapCaptionWordsIntoLines(
      segment.text.split(/\s+/),
      maxCharsPerLine,
      maxLinesPerCue
    ).join('\n');
    lines.push(wrappedText || segment.text);
    lines.push('');
  });

  return {
    srt: lines.join('\n').trim(),
    cueCount: lines.length / 4,
  };
}

async function maybeBuildSubtitleAsset({
  cloudName,
  apiKey,
  apiSecret,
  clip,
  transcriptSegments,
  editingOptions,
  sourceKey,
}) {
  if (!cloudName || !apiKey || !apiSecret || !transcriptSegments.length) {
    return null;
  }

  const captionStyle = resolveCaptionStyle(editingOptions);
  const wordTimings = extractClipWordTimings(
    transcriptSegments,
    clip.startOffset,
    clip.duration
  );

  if (!wordTimings.length) {
    return null;
  }

  const { srt, cueCount } = buildAlignedSrt(
    wordTimings,
    clip.duration,
    captionStyle.maxWordsPerCue,
    captionStyle.maxCharsPerLine,
    captionStyle.maxLinesPerCue
  );
  const publicId = `shorty/feature1/subtitles/${slugify(
    `${sourceKey}-${clip.id}-${clip.startOffset}`
  )}-${Date.now()}`;
  const upload = await uploadBufferToCloudinary({
    cloudName,
    apiKey,
    apiSecret,
    buffer: Buffer.from(srt, 'utf8'),
    fileName: `${slugify(`${clip.title}-${clip.id}`) || 'captions'}.srt`,
    contentType: 'application/x-subrip',
    publicId,
    resourceType: 'raw',
  });
  const formatName = String(upload.format || 'srt').toLowerCase();

  return buildSubtitleAssetResponse(
    cloudName,
    upload.public_id || publicId,
    formatName,
    cueCount,
    upload.secure_url
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const cloudName =
      process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'demo';
    const apiKey = process.env.CLOUDINARY_API_KEY || '';
    const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
    const cld = new Cloudinary({ cloud: { cloudName } });

    const sourceAsset = body.sourceAsset ?? null;
    const googleDriveUrl = body.googleDriveUrl ? normalizeGoogleDriveUrl(body.googleDriveUrl) : null;
    const remoteUrl = googleDriveUrl || sourceAsset?.secureUrl || null;
    const sourceMode =
      googleDriveUrl || sourceAsset?.strategy === 'remote-fetch'
        ? 'remote-fetch'
        : 'cloudinary-public-id';
    const publicId = sourceAsset?.publicId || null;
    const duration = clamp(Number(body.duration || sourceAsset?.duration || 180), 30, 3600);
    const transcriptText = String(body.transcriptText || '').trim();
    const transcriptSegments = normalizeTranscriptSegments(body.transcriptSegments);
    const editingOptions = body.editingOptions ?? {};
    const visualAnalysis = body.visualAnalysis ?? null;
    const sourceDescriptor = resolveSourceDescriptor({
      sourceAsset,
      publicId,
      remoteUrl,
      sourceMode,
      cloudName,
    });

    if (!publicId && !remoteUrl) {
      res
        .status(400)
        .json({ error: 'Provide either a Cloudinary video source or a Google Drive link.' });
      return;
    }

    const plan = buildReelPlan({
      transcriptText,
      transcriptSegments,
      sourceDurationSeconds: duration,
      visualAnalysis,
      editingOptions,
    });
    const sourceKey = publicId || remoteUrl || sourceAsset?.label || 'feature1';
    const clips = await Promise.all(
      plan.clips.map(async (clip) => {
        let subtitleAsset = null;

        try {
          subtitleAsset = await maybeBuildSubtitleAsset({
            cloudName,
            apiKey,
            apiSecret,
            clip,
            transcriptSegments,
            editingOptions,
            sourceKey,
          });
        } catch {
          subtitleAsset = null;
        }

        const renderOptions = {
          cld,
          sourceDescriptor,
          startOffset: clip.startOffset,
          duration: clip.duration,
          editingOptions,
          subtitleAsset,
          captionLines: clip.captionLines,
          fallbackText: clip.transcriptExcerpt || clip.hook || clip.title,
        };
        const previewUrl = buildPreviewClip({
          cld,
          sourceDescriptor,
          startOffset: clip.startOffset,
          duration: clip.duration,
        });
        const deliveryUrl = buildDeliveryUrl(renderOptions);
        const posterUrl = buildPosterUrl(renderOptions);

        return {
          ...clip,
          previewUrl,
          deliveryUrl,
          posterUrl,
          downloadUrl: deliveryUrl,
          aiPreviewUrl: buildAiPreviewUrl({
            cld,
            sourceDescriptor,
            startOffset: clip.startOffset,
            duration: clip.duration,
            editingOptions,
          }),
          subtitleAsset,
        };
      })
    );

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
