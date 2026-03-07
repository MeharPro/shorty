import type { MediaAsset, VideoTranscriptionResponse } from '../types';

export async function transcribeVideo({
  sourceAsset,
  googleDriveUrl,
}: {
  sourceAsset?: MediaAsset | null;
  googleDriveUrl?: string;
}): Promise<VideoTranscriptionResponse> {
  const response = await fetch('/api/transcribe-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceAsset,
      googleDriveUrl,
    }),
  });

  const data = (await response.json()) as VideoTranscriptionResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to transcribe video.');
  }

  return data;
}
