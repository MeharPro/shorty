import type {
  Feature1CropWindow,
  Feature1EditingAdvice,
  MediaAsset,
  ReelGenerationResponse,
  TranscriptSegment,
  VisualAnalysisSummary,
} from '../types';

export interface GenerateReelsInput {
  sourceAsset?: MediaAsset | null;
  googleDriveUrl?: string;
  transcriptText?: string;
  transcriptSegments?: TranscriptSegment[];
  editingOptions?: Feature1EditingAdvice;
  visualAnalysis?: VisualAnalysisSummary | null;
  cropWindows?: Feature1CropWindow[];
}

export async function generateReels({
  sourceAsset,
  googleDriveUrl,
  transcriptText,
  transcriptSegments,
  editingOptions,
  visualAnalysis,
  cropWindows,
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
      transcriptSegments,
      duration: sourceAsset?.duration,
      editingOptions,
      visualAnalysis,
      cropWindows,
    }),
  });

  const data = (await response.json()) as ReelGenerationResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate reels.');
  }

  return data;
}
