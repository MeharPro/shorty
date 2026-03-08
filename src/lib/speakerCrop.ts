import { detectFaces, type FaceBox } from './faceDetection';
import type { Feature1CropWindow } from '../types';

const MAX_ANALYSIS_SAMPLES = 140;
const MIN_SAMPLE_SPACING_SECONDS = 0.45;
const TRACK_EXPIRE_SECONDS = 0.85;
const PORTRAIT_CONTAINER_ASPECT = 9 / 16;
const MAX_CROP_WINDOWS = 28;

interface FaceTrackState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mouthOpenScore: number;
  speakingScore: number;
  speakingMomentum: number;
  lastSeenAt: number;
}

interface SpeakerCropSample {
  time: number;
  trackId: string | null;
  speakerScore: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function waitForEvent(target: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video could not be loaded for speaker crop analysis.'));
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

  if (video.readyState < 1) {
    await waitForEvent(video, 'loadedmetadata');
  }

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

function cleanupVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function faceCenter(face: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>) {
  return {
    x: face.x + face.width / 2,
    y: face.y + face.height / 2,
  };
}

function faceDistance(
  left: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>,
  right: Pick<FaceBox, 'x' | 'y' | 'width' | 'height'>
): number {
  const leftCenter = faceCenter(left);
  const rightCenter = faceCenter(right);

  return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
}

function faceArea(face: Pick<FaceBox, 'width' | 'height'>): number {
  return face.width * face.height;
}

function speakerPriority(face: FaceBox, previousFocus: FaceBox | null): number {
  const sameTrackBoost = previousFocus?.trackId && face.trackId === previousFocus.trackId ? 0.16 : 0;
  const sameLaneBoost =
    previousFocus &&
    Math.abs(face.x + face.width / 2 - (previousFocus.x + previousFocus.width / 2)) < 0.08
      ? 0.06
      : 0;
  const offCenterBias = Math.abs(face.x + face.width / 2 - 0.5) > 0.12 ? 0.03 : 0;

  return (
    (face.speakingMomentum ?? face.speakingScore) * 0.52 +
    (face.mouthMotionScore ?? face.mouthOpenScore) * 0.24 +
    face.speakingScore * 0.12 +
    face.confidence * 0.08 +
    Math.min(faceArea(face) * 1.2, 0.1) +
    sameTrackBoost +
    sameLaneBoost +
    offCenterBias
  );
}

function stabilizeFaces(
  faces: FaceBox[],
  playbackTime: number,
  tracks: Map<string, FaceTrackState>,
  nextTrackIdRef: { current: number }
): FaceBox[] {
  const nextTracks = new Map<string, FaceTrackState>();
  const matchedTrackIds = new Set<string>();
  const visibleFaces = [...faces].sort((left, right) => {
    const leftScore = left.speakingScore * 0.55 + left.mouthOpenScore * 0.25 + left.confidence * 0.2;
    const rightScore =
      right.speakingScore * 0.55 + right.mouthOpenScore * 0.25 + right.confidence * 0.2;

    return rightScore - leftScore;
  });

  const enriched = visibleFaces.map((face) => {
    let bestTrack: FaceTrackState | null = null;
    let bestTrackScore = Number.POSITIVE_INFINITY;

    for (const track of tracks.values()) {
      if (matchedTrackIds.has(track.id) || playbackTime - track.lastSeenAt > TRACK_EXPIRE_SECONDS) {
        continue;
      }

      const sizeRatio =
        Math.min(faceArea(face), faceArea(track)) / Math.max(faceArea(face), faceArea(track), 0.0001);
      const distance = faceDistance(face, track);
      if (distance > 0.2 || sizeRatio < 0.42) {
        continue;
      }

      const trackScore = distance * 0.78 + (1 - sizeRatio) * 0.22;
      if (trackScore < bestTrackScore) {
        bestTrack = track;
        bestTrackScore = trackScore;
      }
    }

    const trackId = bestTrack?.id ?? `face-track-${++nextTrackIdRef.current}`;
    matchedTrackIds.add(trackId);
    const mouthMotionScore = clamp(
      bestTrack
        ? Math.abs(face.mouthOpenScore - bestTrack.mouthOpenScore) * 2.7 +
            Math.abs(face.speakingScore - bestTrack.speakingScore) * 1.6
        : face.mouthOpenScore * 0.4,
      0,
      1
    );
    const speakerSignal = clamp(
      face.speakingScore * 0.5 + mouthMotionScore * 0.36 + face.mouthOpenScore * 0.14,
      0,
      1
    );
    const speakingMomentum = clamp(
      bestTrack ? bestTrack.speakingMomentum * 0.58 + speakerSignal * 0.42 : speakerSignal,
      0,
      1
    );

    nextTracks.set(trackId, {
      id: trackId,
      x: face.x,
      y: face.y,
      width: face.width,
      height: face.height,
      mouthOpenScore: face.mouthOpenScore,
      speakingScore: face.speakingScore,
      speakingMomentum,
      lastSeenAt: playbackTime,
    });

    return {
      ...face,
      trackId,
      mouthMotionScore,
      speakingMomentum,
    };
  });

  tracks.clear();
  for (const [key, track] of nextTracks) {
    tracks.set(key, track);
  }

  return enriched.sort((left, right) => speakerPriority(right, null) - speakerPriority(left, null));
}

function selectSpeakerFace(faces: FaceBox[], previousFocus: FaceBox | null): FaceBox | null {
  if (!faces.length) {
    return null;
  }

  return [...faces].sort(
    (left, right) => speakerPriority(right, previousFocus) - speakerPriority(left, previousFocus)
  )[0] ?? faces[0];
}

function getBaseVisibleArea(videoAspect: number) {
  if (!Number.isFinite(videoAspect) || videoAspect <= 0) {
    return { width: 1, height: 1 };
  }

  if (videoAspect > PORTRAIT_CONTAINER_ASPECT) {
    return {
      width: PORTRAIT_CONTAINER_ASPECT / videoAspect,
      height: 1,
    };
  }

  return {
    width: 1,
    height: videoAspect / PORTRAIT_CONTAINER_ASPECT,
  };
}

function smoothCropRect(previous: SpeakerCropSample | null, next: SpeakerCropSample): SpeakerCropSample {
  if (!previous) {
    return next;
  }

  const speakerChanged = Boolean(next.trackId && previous.trackId && next.trackId !== previous.trackId);
  const blend = speakerChanged ? 0.82 : 0.44;

  return {
    ...next,
    cropX: round(previous.cropX + (next.cropX - previous.cropX) * blend),
    cropY: round(previous.cropY + (next.cropY - previous.cropY) * blend),
    cropWidth: round(previous.cropWidth + (next.cropWidth - previous.cropWidth) * blend),
    cropHeight: round(previous.cropHeight + (next.cropHeight - previous.cropHeight) * blend),
  };
}

function buildCropSample(
  face: FaceBox,
  videoAspect: number,
  safeFrameEnabled: boolean,
  time: number
): SpeakerCropSample {
  const baseVisibleArea = getBaseVisibleArea(videoAspect);
  const horizontalPadding = safeFrameEnabled ? 0.12 : 0.08;
  const verticalPadding = safeFrameEnabled ? 0.18 : 0.12;
  const desiredWidth = clamp(face.width + horizontalPadding * 2, 0.08, 1);
  const desiredHeight = clamp(face.height + verticalPadding * 2, 0.12, 1);
  const fitScale = Math.min(
    baseVisibleArea.width / desiredWidth,
    baseVisibleArea.height / desiredHeight
  );
  const scaleCap = safeFrameEnabled ? 1.12 : 1.2;
  const cropScale = clamp(fitScale, 1, scaleCap);
  const cropWidth = clamp(baseVisibleArea.width / cropScale, 0.08, 1);
  const cropHeight = clamp(baseVisibleArea.height / cropScale, 0.12, 1);
  const centerX = clamp(face.x + face.width / 2, cropWidth / 2, 1 - cropWidth / 2);
  const centerY = clamp(face.y + face.height / 2, cropHeight / 2, 1 - cropHeight / 2);

  return {
    time,
    trackId: face.trackId ?? null,
    speakerScore: round(face.speakingMomentum ?? face.speakingScore),
    cropX: round(centerX - cropWidth / 2),
    cropY: round(centerY - cropHeight / 2),
    cropWidth: round(cropWidth),
    cropHeight: round(cropHeight),
  };
}

function cropSimilarity(left: SpeakerCropSample, right: SpeakerCropSample): number {
  const leftCenter = left.cropX + left.cropWidth / 2;
  const rightCenter = right.cropX + right.cropWidth / 2;
  const leftMiddle = left.cropY + left.cropHeight / 2;
  const rightMiddle = right.cropY + right.cropHeight / 2;

  return (
    Math.abs(leftCenter - rightCenter) * 1.7 +
    Math.abs(leftMiddle - rightMiddle) * 0.8 +
    Math.abs(left.cropWidth - right.cropWidth) * 0.7 +
    Math.abs(left.cropHeight - right.cropHeight) * 0.5
  );
}

function mergeCropWindows(
  left: Feature1CropWindow,
  right: Feature1CropWindow
): Feature1CropWindow {
  const leftDuration = Math.max(0.01, left.end - left.start);
  const rightDuration = Math.max(0.01, right.end - right.start);
  const totalDuration = leftDuration + rightDuration;

  return {
    start: left.start,
    end: right.end,
    cropX: round((left.cropX * leftDuration + right.cropX * rightDuration) / totalDuration),
    cropY: round((left.cropY * leftDuration + right.cropY * rightDuration) / totalDuration),
    cropWidth: round((left.cropWidth * leftDuration + right.cropWidth * rightDuration) / totalDuration),
    cropHeight: round((left.cropHeight * leftDuration + right.cropHeight * rightDuration) / totalDuration),
    speakerScore: round(
      ((left.speakerScore ?? 0) * leftDuration + (right.speakerScore ?? 0) * rightDuration) /
        totalDuration
    ),
  };
}

function compressCropWindows(windows: Feature1CropWindow[]): Feature1CropWindow[] {
  const nextWindows = [...windows];

  while (nextWindows.length > MAX_CROP_WINDOWS) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < nextWindows.length - 1; index += 1) {
      const left = nextWindows[index];
      const right = nextWindows[index + 1];
      const duration = (left.end - left.start) + (right.end - right.start);
      const difference =
        Math.abs(left.cropX - right.cropX) * 1.8 +
        Math.abs(left.cropY - right.cropY) * 0.8 +
        Math.abs(left.cropWidth - right.cropWidth) +
        Math.abs(left.cropHeight - right.cropHeight);
      const score = difference * 12 + duration;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    nextWindows.splice(
      bestIndex,
      2,
      mergeCropWindows(nextWindows[bestIndex], nextWindows[bestIndex + 1])
    );
  }

  return nextWindows;
}

export async function analyzeSpeakerCropWindows({
  src,
  duration,
  safeFrameEnabled = true,
}: {
  src: string;
  duration?: number;
  safeFrameEnabled?: boolean;
}): Promise<Feature1CropWindow[]> {
  const video = await loadVideo(src);
  const tracks = new Map<string, FaceTrackState>();
  const nextTrackIdRef = { current: 0 };
  const samples: SpeakerCropSample[] = [];
  let previousFocus: FaceBox | null = null;
  let previousSample: SpeakerCropSample | null = null;

  try {
    const safeDuration = clamp(Number(duration) || video.duration || 0, 1, Math.max(video.duration || 1, 1));
    const videoAspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1;
    const sampleSpacingSeconds = Math.max(
      MIN_SAMPLE_SPACING_SECONDS,
      safeDuration / MAX_ANALYSIS_SAMPLES
    );
    const sampleTimes: number[] = [];

    for (let time = 0.15; time < safeDuration; time += sampleSpacingSeconds) {
      sampleTimes.push(time);
    }

    if (sampleTimes.length === 0) {
      sampleTimes.push(0.15);
    }

    for (const time of sampleTimes) {
      await seekVideo(video, time);
      const faces = await detectFaces(video, performance.now());
      const stabilizedFaces = stabilizeFaces(faces, time, tracks, nextTrackIdRef);
      const focusFace = selectSpeakerFace(stabilizedFaces, previousFocus);

      if (focusFace) {
        const nextSample = smoothCropRect(
          previousSample,
          buildCropSample(focusFace, videoAspect, safeFrameEnabled, time)
        );
        samples.push(nextSample);
        previousSample = nextSample;
        previousFocus = focusFace;
        continue;
      }

      if (previousSample) {
        const carriedSample: SpeakerCropSample = {
          ...previousSample,
          time,
          speakerScore: round((previousSample.speakerScore ?? 0) * 0.86),
        };
        samples.push(carriedSample);
        previousSample = carriedSample;
      }
    }

    if (!samples.length) {
      return [];
    }

    const windows: Feature1CropWindow[] = [];

    samples.forEach((sample, index) => {
      const previousTime = index > 0 ? samples[index - 1].time : 0;
      const nextTime = index < samples.length - 1 ? samples[index + 1].time : safeDuration;
      const start = index === 0 ? 0 : (previousTime + sample.time) / 2;
      const end = index === samples.length - 1 ? safeDuration : (sample.time + nextTime) / 2;

      if (end - start < 0.16) {
        return;
      }

      const previousWindow = windows[windows.length - 1];
      const nextWindow: Feature1CropWindow = {
        start: round(start),
        end: round(end),
        cropX: sample.cropX,
        cropY: sample.cropY,
        cropWidth: sample.cropWidth,
        cropHeight: sample.cropHeight,
        speakerScore: sample.speakerScore,
      };

      if (
        previousWindow &&
        cropSimilarity(
          {
            ...sample,
            time: previousWindow.start,
            cropX: previousWindow.cropX,
            cropY: previousWindow.cropY,
            cropWidth: previousWindow.cropWidth,
            cropHeight: previousWindow.cropHeight,
          },
          sample
        ) < 0.065
      ) {
        previousWindow.end = nextWindow.end;
        previousWindow.cropX = round((previousWindow.cropX + nextWindow.cropX) / 2);
        previousWindow.cropY = round((previousWindow.cropY + nextWindow.cropY) / 2);
        previousWindow.cropWidth = round((previousWindow.cropWidth + nextWindow.cropWidth) / 2);
        previousWindow.cropHeight = round((previousWindow.cropHeight + nextWindow.cropHeight) / 2);
        previousWindow.speakerScore = round(
          Math.max(previousWindow.speakerScore ?? 0, nextWindow.speakerScore ?? 0)
        );
        return;
      }

      windows.push(nextWindow);
    });

    if (!windows.length) {
      return [];
    }

    windows[0].start = 0;
    windows[windows.length - 1].end = round(safeDuration);

    return compressCropWindows(windows).map((window, index, array) => ({
      ...window,
      start: index === 0 ? 0 : window.start,
      end: index === array.length - 1 ? round(safeDuration) : window.end,
    }));
  } finally {
    cleanupVideo(video);
  }
}
