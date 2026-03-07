import type { MediaAsset, ReelGenerationResponse } from '../types';

export interface GenerateReelsInput {
  sourceAsset?: MediaAsset | null;
  googleDriveUrl?: string;
  transcriptText?: string;
}

export async function generateReels({
  sourceAsset,
  googleDriveUrl,
  transcriptText,
}: GenerateReelsInput): Promise<ReelGenerationResponse> {
  const response = await fetch('/api/generate-reels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceAsset,
      googleDriveUrl,
      transcriptText,
      duration: sourceAsset?.duration,
    }),
  });

  const data = (await response.json()) as ReelGenerationResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate reels.');
  }

  return data;
}
