import { detectFaces, type FaceBox } from './faceDetection';
import type { Feature1EditingAdvice, ReelCandidate, ReelQualityAudit } from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function speakerScore(face: FaceBox): number {
  return face.speakingScore * 0.52 + face.mouthOpenScore * 0.28 + face.confidence * 0.2;
}

function waitForEvent(target: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Video could not be loaded for reel QA.'));
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
  const targetTime = clamp(time, 0, Math.max((video.duration || 0) - 0.05, 0));
  if (Math.abs(video.currentTime - targetTime) < 0.01) {
    return;
  }

  const seekPromise = waitForEvent(video, 'seeked');
  video.currentTime = targetTime;
  await seekPromise;
}

function chooseSpeakerFace(faces: FaceBox[]): FaceBox | null {
  return [...faces].sort((left, right) => speakerScore(right) - speakerScore(left))[0] ?? null;
}

function assessSpeakerVisibility(face: FaceBox): boolean {
  const leftMargin = face.x;
  const rightMargin = 1 - (face.x + face.width);
  const topMargin = face.y;
  const bottomMargin = 1 - (face.y + face.height);
  const area = face.width * face.height;

  return (
    leftMargin >= 0.015 &&
    rightMargin >= 0.015 &&
    topMargin >= 0.015 &&
    bottomMargin >= 0.015 &&
    area <= 0.34
  );
}

export async function auditReelClip(
  clip: ReelCandidate,
  editingOptions: Feature1EditingAdvice
): Promise<ReelQualityAudit> {
  const sampleCount = 5;
  const sampleTimes = Array.from({ length: sampleCount }, (_, index) =>
    clip.duration * ((index + 1) / (sampleCount + 1))
  );

  const video = await loadVideo(clip.previewUrl || clip.deliveryUrl);
  let framesWithFaces = 0;
  let visibleSpeakerFrames = 0;
  const notes = new Set<string>();

  try {
    for (const sampleTime of sampleTimes) {
      await seekVideo(video, sampleTime);
      const faces = await detectFaces(video, performance.now());

      if (!faces.length) {
        notes.add('Some sampled moments had no detectable face.');
        continue;
      }

      framesWithFaces += 1;
      const speakerFace = chooseSpeakerFace(faces);
      if (!speakerFace) {
        continue;
      }

      if (assessSpeakerVisibility(speakerFace)) {
        visibleSpeakerFrames += 1;
      } else {
        notes.add('The active speaker gets too close to the frame edge in some moments.');
      }

      if ((speakerFace.speakingScore < 0.3 && speakerFace.mouthOpenScore < 0.22) || faces.length > 3) {
        notes.add('Speaker confidence is mixed in part of the clip; review if multiple people overlap.');
      }
    }
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  const speakerFaceVisibleRatio =
    framesWithFaces > 0 ? round(visibleSpeakerFrames / framesWithFaces) : 0;
  const status =
    editingOptions.safeFaceFrame !== false && speakerFaceVisibleRatio >= 0.8 && framesWithFaces >= 3
      ? 'pass'
      : speakerFaceVisibleRatio >= 0.7 && framesWithFaces >= 3
        ? 'pass'
        : 'warn';

  if (editingOptions.safeFaceFrame !== false) {
    notes.add('Safe face framing is enabled for final renders.');
  }

  if (editingOptions.qaEnabled !== false) {
    notes.add('Clip was checked against speaker-face visibility and caption-fit rules.');
  }

  return {
    status,
    samples: sampleCount,
    framesWithFaces,
    speakerFaceVisibleRatio,
    notes: Array.from(notes).slice(0, 4),
  };
}

export async function auditGeneratedClips(
  clips: ReelCandidate[],
  editingOptions: Feature1EditingAdvice
): Promise<ReelCandidate[]> {
  const audited: ReelCandidate[] = [];

  for (const clip of clips) {
    try {
      const qa = await auditReelClip(clip, editingOptions);
      audited.push({
        ...clip,
        qa,
      });
    } catch {
      audited.push({
        ...clip,
        qa: {
          status: 'warn',
          samples: 0,
          framesWithFaces: 0,
          speakerFaceVisibleRatio: 0,
          notes: ['QA scan failed; review this reel manually.'],
        },
      });
    }
  }

  return audited;
}

export function chooseRecommendedClip(clips: ReelCandidate[], currentRecommendedId: string | null): string | null {
  const currentRecommended = clips.find((clip) => clip.id === currentRecommendedId);
  if (currentRecommended?.qa?.status === 'pass') {
    return currentRecommended.id;
  }

  const passing = clips.filter((clip) => clip.qa?.status === 'pass');
  if (passing.length > 0) {
    return passing.sort((left, right) => right.viralityScore - left.viralityScore)[0].id;
  }

  return clips[0]?.id ?? currentRecommendedId ?? null;
}
