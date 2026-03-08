import type { AgentCommandResponse, WorkflowFeatureId, WorkflowGraph } from './types';

export interface AgentCommandInput {
  feature: WorkflowFeatureId;
  prompt: string;
  workflow: WorkflowGraph;
  sessionUserKey?: string;
}

export async function sendAgentCommand(
  input: AgentCommandInput
): Promise<AgentCommandResponse> {
  const response = await fetch('/api/agent-command', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as AgentCommandResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to run the workflow agent.');
  }

  return payload;
}
