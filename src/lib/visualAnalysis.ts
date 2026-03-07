import { FaceLandmarker, FilesetResolver, type Category } from '@mediapipe/tasks-vision';
import type { VisualAnalysisSummary, VisualHighlight } from '../types';

let landmarker: FaceLandmarker | null = null;
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

const MAX_ANALYSIS_SAMPLES = 90;
const MIN_SAMPLE_SPACING_SECONDS = 0.8;
const HIGHLIGHT_THRESHOLD = 0.36;
const MAX_HIGHLIGHTS = 8;

interface ExpressionSample {
  time: number;
  faceCount: number;
  smile: number;
  surprise: number;
  emphasis: number;
  engagement: number;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function ensureLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) {
    return landmarker;
  }

  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
      );

      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    })();
  }

  landmarker = await landmarkerPromise;
  return landmarker;
}

function waitForEvent(target: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video could not be loaded for MediaPipe visual analysis.'));
    };

    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess);
      target.removeEventListener('error', handleError);
    };

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });
}

async function loadVideo(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.src = src;

  if (video.readyState >= 1) {
    return video;
  }

  await waitForEvent(video, 'loadedmetadata');
  return video;
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const nextTime = clamp(time, 0, Math.max((video.duration || 0) - 0.05, 0));

  if (Math.abs(video.currentTime - nextTime) < 0.01) {
    return;
  }

  const seekPromise = waitForEvent(video, 'seeked');
  video.currentTime = nextTime;
  await seekPromise;
}

function getBlendshapeScore(categories: Category[], ...names: string[]): number {
  return names.reduce((best, name) => {
    const match = categories.find((category) => category.categoryName === name);
    return Math.max(best, match?.score ?? 0);
  }, 0);
}

function toSampleScore(categories: Category[], faceCount: number, time: number): ExpressionSample {
  const smile = Math.max(
    getBlendshapeScore(categories, 'mouthSmileLeft'),
    getBlendshapeScore(categories, 'mouthSmileRight')
  );
  const surprise = clamp(
    getBlendshapeScore(categories, 'browInnerUp') * 0.35 +
      getBlendshapeScore(categories, 'eyeWideLeft', 'eyeWideRight') * 0.25 +
      getBlendshapeScore(categories, 'jawOpen', 'mouthOpen') * 0.4,
    0,
    1
  );
  const emphasis = clamp(
    getBlendshapeScore(categories, 'jawOpen', 'mouthOpen') * 0.55 +
      getBlendshapeScore(categories, 'mouthPucker', 'mouthPressLeft', 'mouthPressRight') * 0.15 +
      getBlendshapeScore(categories, 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight') * 0.3,
    0,
    1
  );
  const engagement = clamp(
    smile * 0.42 + surprise * 0.33 + emphasis * 0.25,
    0,
    1
  );
  const score = clamp(
    engagement * 0.45 + surprise * 0.3 + emphasis * 0.18 + Math.min(faceCount, 1) * 0.07,
    0,
    1
  );

  return {
    time,
    faceCount,
    smile,
    surprise,
    emphasis,
    engagement,
    score,
  };
}

function dominantExpression(sample: ExpressionSample): VisualHighlight['dominantExpression'] {
  const pairs: Array<[VisualHighlight['dominantExpression'], number]> = [
    ['smile', sample.smile],
    ['surprise', sample.surprise],
    ['emphasis', sample.emphasis],
    ['engagement', sample.engagement],
  ];

  pairs.sort((left, right) => right[1] - left[1]);
  return pairs[0][0];
}

function labelForExpression(kind: VisualHighlight['dominantExpression']): string {
  switch (kind) {
    case 'smile':
      return 'Strong smile / positive reaction';
    case 'surprise':
      return 'Surprise spike / eye-catching reaction';
    case 'emphasis':
      return 'High-emphasis delivery moment';
    default:
      return 'Highly engaging facial moment';
  }
}

function mergeSamplesIntoHighlights(samples: ExpressionSample[], spacingSeconds: number): VisualHighlight[] {
  const selected = samples.filter((sample) => sample.score >= HIGHLIGHT_THRESHOLD);
  if (!selected.length) {
    return [];
  }

  const merged: VisualHighlight[] = [];
  let buffer: ExpressionSample[] = [];

  const flush = () => {
    if (!buffer.length) {
      return;
    }

    const peak = buffer.reduce((best, item) => (item.score > best.score ? item : best), buffer[0]);
    const avg = buffer.reduce(
      (acc, item) => ({
        score: acc.score + item.score,
        smile: acc.smile + item.smile,
        surprise: acc.surprise + item.surprise,
        emphasis: acc.emphasis + item.emphasis,
        engagement: acc.engagement + item.engagement,
        faceCount: acc.faceCount + item.faceCount,
      }),
      { score: 0, smile: 0, surprise: 0, emphasis: 0, engagement: 0, faceCount: 0 }
    );

    const count = buffer.length;
    const averaged: ExpressionSample = {
      time: peak.time,
      faceCount: avg.faceCount / count,
      smile: avg.smile / count,
      surprise: avg.surprise / count,
      emphasis: avg.emphasis / count,
      engagement: avg.engagement / count,
      score: avg.score / count,
    };

    const dominant = dominantExpression(peak);
    merged.push({
      id: `highlight-${merged.length + 1}`,
      start: round(Math.max(0, buffer[0].time - spacingSeconds * 0.65)),
      end: round(buffer[buffer.length - 1].time + spacingSeconds * 0.65),
      score: round(peak.score),
      label: labelForExpression(dominant),
      dominantExpression: dominant,
      faceCount: Math.max(1, Math.round(averaged.faceCount)),
      metrics: {
        smile: round(averaged.smile),
        surprise: round(averaged.surprise),
        emphasis: round(averaged.emphasis),
        engagement: round(averaged.engagement),
      },
    });
    buffer = [];
  };

  for (const sample of selected) {
    const prev = buffer[buffer.length - 1];
    if (!prev || sample.time - prev.time <= spacingSeconds * 1.8) {
      buffer.push(sample);
      continue;
    }
    flush();
    buffer.push(sample);
  }
  flush();

  return merged
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_HIGHLIGHTS)
    .map((highlight, index) => ({ ...highlight, id: `highlight-${index + 1}` }));
}

export async function analyzeVideoExpressions({
  src,
  duration,
  sourcePublicId,
}: {
  src: string;
  duration?: number;
  sourcePublicId?: string;
}): Promise<VisualAnalysisSummary> {
  const marker = await ensureLandmarker();
  const video = await loadVideo(src);

  try {
    const safeDuration = clamp(Number(duration) || video.duration || 0, 1, Math.max(video.duration || 1, 1));
    const sampleSpacingSeconds = Math.max(MIN_SAMPLE_SPACING_SECONDS, safeDuration / MAX_ANALYSIS_SAMPLES);
    const sampleTimes: number[] = [];

    for (let time = 0.15; time < safeDuration; time += sampleSpacingSeconds) {
      sampleTimes.push(time);
    }

    if (sampleTimes.length === 0) {
      sampleTimes.push(0.15);
    }

    const samples: ExpressionSample[] = [];

    for (const time of sampleTimes) {
      await seekVideo(video, time);
      const result = marker.detectForVideo(video, performance.now());
      const categories = result.faceBlendshapes?.[0]?.categories ?? [];

      if (!categories.length) {
        continue;
      }

      samples.push(toSampleScore(categories, result.faceLandmarks?.length ?? 0, time));
    }

    const averageScore = samples.length
      ? round(samples.reduce((sum, sample) => sum + sample.score, 0) / samples.length)
      : 0;
    const peakScore = samples.length
      ? round(samples.reduce((best, sample) => Math.max(best, sample.score), 0))
      : 0;

    return {
      provider: 'mediapipe-face-landmarker',
      sourcePublicId,
      sourceUrl: src,
      analyzedDuration: round(safeDuration),
      sampleCount: samples.length,
      averageScore,
      peakScore,
      highlights: mergeSamplesIntoHighlights(samples, sampleSpacingSeconds),
      generatedAt: new Date().toISOString(),
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}