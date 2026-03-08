import { Cloudinary } from '@cloudinary/url-gen';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { source } from '@cloudinary/url-gen/actions/overlay';
import { crop, fill, scale } from '@cloudinary/url-gen/actions/resize';
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
  fontSize: 24,
  fontWeight: 'bold',
  strokeColor: '#000000',
  strokeWidth: 3,
  placement: 'center',
  horizontalOffset: 0,
  verticalOffset: 0,
};

const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1920;
const CAPTION_MAX_LINES = 1;
const MIN_CROP_SEGMENT_DURATION = 0.18;
const MAX_DYNAMIC_CROP_SEGMENTS = 12;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    fontSize: shakingCaptions ? 26 : FEATURE1_CAPTION_STYLE.fontSize,
    strokeWidth: shakingCaptions ? 4 : FEATURE1_CAPTION_STYLE.strokeWidth,
    maxWordsPerCue: 1,
    maxCharsPerLine: editingOptions.captionDensity === 'tight' ? 10 : 12,
    maxLinesPerCue: CAPTION_MAX_LINES,
  };
}

function splitFallbackCaptionLines(lines, fallbackText) {
  const sourceText = cleanText((Array.isArray(lines) ? lines.join(' ') : '') || fallbackText);
  if (!sourceText) {
    return ['Watch'];
  }

  return [sourceText.split(/\s+/)[0] || 'Watch'];
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
  const overlayText = sanitizeOverlayText(line) || 'Watch';
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

function formatOffset(value) {
  const rounded = Math.round(Number(value || 0) * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/\.?0+$/, '');
}

function cropWindowDifference(left, right) {
  const leftCenterX = left.cropX + left.cropWidth / 2;
  const rightCenterX = right.cropX + right.cropWidth / 2;
  const leftCenterY = left.cropY + left.cropHeight / 2;
  const rightCenterY = right.cropY + right.cropHeight / 2;

  return (
    Math.abs(leftCenterX - rightCenterX) * 1.8 +
    Math.abs(leftCenterY - rightCenterY) * 0.8 +
    Math.abs(left.cropWidth - right.cropWidth) +
    Math.abs(left.cropHeight - right.cropHeight)
  );
}

function mergeCropWindows(left, right) {
  const leftDuration = Math.max(0.01, left.end - left.start);
  const rightDuration = Math.max(0.01, right.end - right.start);
  const totalDuration = leftDuration + rightDuration;

  return {
    start: left.start,
    end: right.end,
    cropX: (left.cropX * leftDuration + right.cropX * rightDuration) / totalDuration,
    cropY: (left.cropY * leftDuration + right.cropY * rightDuration) / totalDuration,
    cropWidth: (left.cropWidth * leftDuration + right.cropWidth * rightDuration) / totalDuration,
    cropHeight: (left.cropHeight * leftDuration + right.cropHeight * rightDuration) / totalDuration,
    speakerScore:
      ((left.speakerScore || 0) * leftDuration + (right.speakerScore || 0) * rightDuration) /
      totalDuration,
  };
}

function normalizeCropWindows(input, sourceDuration) {
  if (!Array.isArray(input)) {
    return [];
  }

  const windows = input
    .map((window) => {
      const start = clamp(Number(window?.start || 0), 0, sourceDuration);
      const end = clamp(Number(window?.end || 0), start, sourceDuration);
      const cropWidth = clamp(Number(window?.cropWidth || 0), 0.12, 1);
      const cropHeight = clamp(Number(window?.cropHeight || 0), 0.12, 1);
      const cropX = clamp(Number(window?.cropX || 0), 0, Math.max(0, 1 - cropWidth));
      const cropY = clamp(Number(window?.cropY || 0), 0, Math.max(0, 1 - cropHeight));

      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_CROP_SEGMENT_DURATION) {
        return null;
      }

      return {
        start,
        end,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        speakerScore: Number(window?.speakerScore || 0) || 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);

  const merged = [];

  windows.forEach((window) => {
    const previousWindow = merged[merged.length - 1];

    if (!previousWindow) {
      merged.push(window);
      return;
    }

    if (
      window.start - previousWindow.end <= 0.1 &&
      cropWindowDifference(previousWindow, window) < 0.055
    ) {
      previousWindow.end = Math.max(previousWindow.end, window.end);
      previousWindow.cropX = (previousWindow.cropX + window.cropX) / 2;
      previousWindow.cropY = (previousWindow.cropY + window.cropY) / 2;
      previousWindow.cropWidth = (previousWindow.cropWidth + window.cropWidth) / 2;
      previousWindow.cropHeight = (previousWindow.cropHeight + window.cropHeight) / 2;
      previousWindow.speakerScore = Math.max(previousWindow.speakerScore || 0, window.speakerScore || 0);
      return;
    }

    merged.push(window);
  });

  return merged;
}

function mergeClipCropSegments(left, right) {
  const leftDuration = Math.max(0.01, left.end - left.start);
  const rightDuration = Math.max(0.01, right.end - right.start);
  const totalDuration = leftDuration + rightDuration;

  return {
    start: left.start,
    end: right.end,
    cropX: (left.cropX * leftDuration + right.cropX * rightDuration) / totalDuration,
    cropY: (left.cropY * leftDuration + right.cropY * rightDuration) / totalDuration,
    cropWidth: (left.cropWidth * leftDuration + right.cropWidth * rightDuration) / totalDuration,
    cropHeight: (left.cropHeight * leftDuration + right.cropHeight * rightDuration) / totalDuration,
  };
}

function compressClipCropSegments(segments) {
  const nextSegments = [...segments];

  while (nextSegments.length > MAX_DYNAMIC_CROP_SEGMENTS) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < nextSegments.length - 1; index += 1) {
      const left = nextSegments[index];
      const right = nextSegments[index + 1];
      const combinedDuration = (left.end - left.start) + (right.end - right.start);
      const score = cropWindowDifference(left, right) * 12 + combinedDuration;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    nextSegments.splice(
      bestIndex,
      2,
      mergeClipCropSegments(nextSegments[bestIndex], nextSegments[bestIndex + 1])
    );
  }

  return nextSegments;
}

function selectClipCropSegments(cropWindows, clipStart, clipDuration) {
  if (!Array.isArray(cropWindows) || cropWindows.length === 0) {
    return [];
  }

  const clipEnd = clipStart + clipDuration;
  const overlaps = cropWindows
    .map((window) => {
      const start = Math.max(clipStart, window.start);
      const end = Math.min(clipEnd, window.end);

      if (end - start < MIN_CROP_SEGMENT_DURATION) {
        return null;
      }

      return {
        start: start - clipStart,
        end: end - clipStart,
        cropX: window.cropX,
        cropY: window.cropY,
        cropWidth: window.cropWidth,
        cropHeight: window.cropHeight,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);

  if (!overlaps.length) {
    return [];
  }

  const filled = overlaps.map((segment) => ({ ...segment }));
  filled[0].start = 0;

  for (let index = 0; index < filled.length - 1; index += 1) {
    const nextStart = clamp(filled[index + 1].start, filled[index].start, clipDuration);
    filled[index].end = Math.max(filled[index].start + MIN_CROP_SEGMENT_DURATION, nextStart);
  }

  filled[filled.length - 1].end = clipDuration;

  const filtered = filled.filter((segment) => segment.end - segment.start >= 0.08);
  return compressClipCropSegments(filtered).map((segment, index, segments) => {
    const nextStart = index < segments.length - 1 ? segments[index + 1].start : clipDuration;
    const end = index === segments.length - 1 ? clipDuration : Math.max(segment.start + 0.08, nextStart);

    return {
      ...segment,
      start: Math.max(0, segment.start),
      duration: Math.max(0.08, end - segment.start),
    };
  });
}

function resolveCropPixels(segment, sourceWidth, sourceHeight) {
  const width = clamp(Math.round(segment.cropWidth * sourceWidth), 1, sourceWidth);
  const height = clamp(Math.round(segment.cropHeight * sourceHeight), 1, sourceHeight);
  const x = clamp(Math.round(segment.cropX * sourceWidth), 0, Math.max(0, sourceWidth - width));
  const y = clamp(Math.round(segment.cropY * sourceHeight), 0, Math.max(0, sourceHeight - height));

  return { width, height, x, y };
}

function buildCropTransformation(cropPixels) {
  return crop()
    .width(cropPixels.width)
    .height(cropPixels.height)
    .x(cropPixels.x)
    .y(cropPixels.y)
    .toString();
}

function buildScaleTransformation() {
  return scale().width(RENDER_WIDTH).height(RENDER_HEIGHT).toString();
}

function buildSpliceLayerTransformation(sourcePublicId, cropPixels, startOffset, duration) {
  return [
    `l_video:${serializeOverlayPublicId(sourcePublicId)}`,
    buildCropTransformation(cropPixels),
    buildScaleTransformation(),
    `fl_splice,so_${formatOffset(startOffset)},du_${formatOffset(duration)}`,
    'fl_layer_apply',
  ].join('/');
}

function buildBaseClipRender({
  cld,
  sourceDescriptor,
  startOffset,
  duration,
  editingOptions = {},
  cropWindows = [],
  sourceWidth = 0,
  sourceHeight = 0,
}) {
  const canApplyDynamicCrop =
    !sourceDescriptor.useFetch &&
    Boolean(sourceDescriptor.publicId) &&
    sourceWidth > 0 &&
    sourceHeight > 0 &&
    Array.isArray(cropWindows) &&
    cropWindows.length > 0;

  if (canApplyDynamicCrop) {
    const clipCropSegments = selectClipCropSegments(cropWindows, startOffset, duration);

    if (clipCropSegments.length > 0) {
      const [firstSegment, ...remainingSegments] = clipCropSegments;
      const firstCropPixels = resolveCropPixels(firstSegment, sourceWidth, sourceHeight);
      const render = createSourceVideo(cld, sourceDescriptor)
        .videoEdit(
          trim()
            .startOffset(startOffset + firstSegment.start)
            .duration(firstSegment.duration)
        )
        .resize(
          crop()
            .width(firstCropPixels.width)
            .height(firstCropPixels.height)
            .x(firstCropPixels.x)
            .y(firstCropPixels.y)
        )
        .resize(scale().width(RENDER_WIDTH).height(RENDER_HEIGHT));

      remainingSegments.forEach((segment) => {
        render.addTransformation(
          buildSpliceLayerTransformation(
            sourceDescriptor.publicId,
            resolveCropPixels(segment, sourceWidth, sourceHeight),
            startOffset + segment.start,
            segment.duration
          )
        );
      });

      return render;
    }
  }

  return createSourceVideo(cld, sourceDescriptor)
    .videoEdit(trim().startOffset(startOffset).duration(duration))
    .resize(fill().width(RENDER_WIDTH).height(RENDER_HEIGHT).gravity(buildFocusGravity(editingOptions)));
}

function buildRenderableClip({
  cld,
  sourceDescriptor,
  startOffset,
  duration,
  editingOptions = {},
  cropWindows = [],
  sourceWidth = 0,
  sourceHeight = 0,
  subtitleAsset = null,
  captionLines = [],
  fallbackText = '',
}) {
  const captionStyle = resolveCaptionStyle(editingOptions);
  const render = buildBaseClipRender({
    cld,
    sourceDescriptor,
    startOffset,
    duration,
    editingOptions,
    cropWindows,
    sourceWidth,
    sourceHeight,
  });

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

function buildPreviewClip({
  cld,
  sourceDescriptor,
  startOffset,
  duration,
  cropWindows = [],
  sourceWidth = 0,
  sourceHeight = 0,
}) {
  return buildBaseClipRender({
    cld,
    sourceDescriptor,
    startOffset,
    duration,
    editingOptions: { faceFocus: true },
    cropWindows,
    sourceWidth,
    sourceHeight,
  })
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

function buildAiPreviewUrl({
  cld,
  sourceDescriptor,
  startOffset,
  duration,
  editingOptions = {},
  cropWindows = [],
  sourceWidth = 0,
  sourceHeight = 0,
}) {
  return buildBaseClipRender({
    cld,
    sourceDescriptor,
    startOffset,
    duration,
    editingOptions,
    cropWindows,
    sourceWidth,
    sourceHeight,
  })
    .delivery(format('mp4'))
    .delivery(quality(autoQuality()))
    .toURL();
}

function isRetryableDerivedAssetStatus(status) {
  return [404, 420, 423, 425, 429].includes(status);
}

async function warmCloudinaryDerivedAsset(url, { attempts = 6, delayMs = 1200 } = {}) {
  if (!url) {
    return false;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        return true;
      }

      if (!isRetryableDerivedAssetStatus(response.status)) {
        return false;
      }
    } catch {
      // Keep retrying transient network issues; the browser preview has its own retry path too.
    }

    await sleep(delayMs);
  }

  return false;
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
  const safeMaxWordsPerCue = clamp(maxWordsPerCue, 1, 6);
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
    const sourceWidth = Math.max(0, Math.round(Number(sourceAsset?.width || 0)));
    const sourceHeight = Math.max(0, Math.round(Number(sourceAsset?.height || 0)));
    const transcriptText = String(body.transcriptText || '').trim();
    const transcriptSegments = normalizeTranscriptSegments(body.transcriptSegments);
    const editingOptions = body.editingOptions ?? {};
    const visualAnalysis = body.visualAnalysis ?? null;
    const cropWindows = normalizeCropWindows(body.cropWindows, duration);
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
          cropWindows,
          sourceWidth,
          sourceHeight,
          subtitleAsset,
          captionLines: clip.captionLines,
          fallbackText: clip.transcriptExcerpt || clip.hook || clip.title,
        };
        const previewUrl = buildPreviewClip({
          cld,
          sourceDescriptor,
          startOffset: clip.startOffset,
          duration: clip.duration,
          cropWindows,
          sourceWidth,
          sourceHeight,
        });
        const deliveryUrl = buildDeliveryUrl(renderOptions);
        const posterUrl = buildPosterUrl(renderOptions);
        await Promise.all([
          warmCloudinaryDerivedAsset(deliveryUrl),
          warmCloudinaryDerivedAsset(posterUrl, { attempts: 4, delayMs: 800 }),
        ]);

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
            cropWindows,
            sourceWidth,
            sourceHeight,
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
