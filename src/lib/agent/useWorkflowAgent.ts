import { useMemo, useState } from 'react';
import { sendAgentCommand } from './client';
import type {
  AgentCommandResponse,
  WorkflowChatMessage,
  WorkflowFeatureId,
  WorkflowGraph,
} from './types';

interface UseWorkflowAgentOptions {
  feature: WorkflowFeatureId;
  sessionUserKey?: string;
  getWorkflowGraph: () => WorkflowGraph;
  applyResponse: (response: AgentCommandResponse) => Promise<string>;
}

function createMessage(
  role: WorkflowChatMessage['role'],
  content: string
): WorkflowChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

export function useWorkflowAgent({
  feature,
  sessionUserKey,
  getWorkflowGraph,
  applyResponse,
}: UseWorkflowAgentOptions) {
  const [messages, setMessages] = useState<WorkflowChatMessage[]>(() => [
    createMessage(
      'assistant',
      'Workflow agent ready. Describe the edit you want and I will mutate the graph and run the existing pipeline when needed.'
    ),
  ]);
  const [draft, setDraft] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [lastResponse, setLastResponse] = useState<AgentCommandResponse | null>(null);
  const [status, setStatus] = useState('Manual controls remain available if the agent is idle.');
  const [error, setError] = useState('');

  const canSend = useMemo(() => draft.trim().length > 0 && !isBusy, [draft, isBusy]);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || isBusy) {
      return;
    }

    setIsBusy(true);
    setError('');
    setDraft('');
    setStatus('Planning graph changes...');
    setMessages((current) => [...current, createMessage('user', prompt)]);

    try {
      const response = await sendAgentCommand({
        feature,
        prompt,
        workflow: getWorkflowGraph(),
        sessionUserKey,
      });
      setLastResponse(response);
      setStatus('Applying graph changes...');

      const executionSummary = await applyResponse(response);
      const assistantMessage = executionSummary
        ? `${response.summary}\n\n${executionSummary}`
        : response.summary;

      setMessages((current) => [...current, createMessage('assistant', assistantMessage)]);
      setStatus(
        response.execution.shouldRun
          ? 'Agent applied the graph update and executed the current pipeline.'
          : 'Agent applied the graph update without running the pipeline.'
      );
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : 'Failed to run the workflow agent.';
      setError(message);
      setStatus('Agent failed closed. Manual controls are still available.');
      setMessages((current) => [
        ...current,
        createMessage('assistant', `${message} Manual controls remain available.`),
      ]);
    } finally {
      setIsBusy(false);
    }
  };

  return {
    canSend,
    draft,
    error,
    isBusy,
    lastResponse,
    messages,
    send,
    setDraft,
    status,
  };
}
