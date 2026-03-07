import type { Feature1AgentPlan, Feature1EditingAdvice } from '../types';

interface PlanFeature1PipelineInput {
  wish: string;
  transcriptPreview?: string;
  currentEditingOptions: Feature1EditingAdvice;
  activeLogicBlocks: string[];
}

export async function planFeature1Pipeline({
  wish,
  transcriptPreview,
  currentEditingOptions,
  activeLogicBlocks,
}: PlanFeature1PipelineInput): Promise<Feature1AgentPlan> {
  const response = await fetch('/api/feature1-agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      wish,
      transcriptPreview,
      currentEditingOptions,
      activeLogicBlocks,
    }),
  });

  const data = (await response.json()) as Feature1AgentPlan & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || 'Failed to plan Feature 1 changes.');
  }

  return data;
}
