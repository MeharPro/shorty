import type { MediaAsset, ReelGenerationResponse, VisualAnalysisSummary } from '../types';

export interface EditingOptions {
  removeSilences?: boolean;
  shakingCaptions?: boolean;
  faceFocus?: boolean;
}

export interface GenerateReelsInput {
  sourceAsset?: MediaAsset | null;
  googleDriveUrl?: string;
  transcriptText?: string;
  editingOptions?: EditingOptions;
  visualAnalysis?: VisualAnalysisSummary | null;
}

export async function generateReels({
  sourceAsset,
  googleDriveUrl,
  transcriptText,
  editingOptions,
  visualAnalysis,
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
      editingOptions,
      visualAnalysis,
    }),
  });

  const data = (await response.json()) as ReelGenerationResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate reels.');
  }

  return data;
}
