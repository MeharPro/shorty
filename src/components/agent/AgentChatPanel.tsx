import type { AgentCommandResponse, WorkflowChatMessage, WorkflowGraph } from '../../lib/agent/types';

interface AgentChatPanelProps {
  title: string;
  subtitle: string;
  draft: string;
  isBusy: boolean;
  status: string;
  error: string;
  messages: WorkflowChatMessage[];
  response: AgentCommandResponse | null;
  workflow: WorkflowGraph;
  executionPlan: unknown;
  composerTestId?: string;
  sendTestId?: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onExportWorkflow: () => void;
  onExportPlan: () => void;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function AgentChatPanel({
  title,
  subtitle,
  draft,
  isBusy,
  status,
  error,
  messages,
  response,
  workflow,
  executionPlan,
  composerTestId,
  sendTestId,
  onDraftChange,
  onSend,
  onExportWorkflow,
  onExportPlan,
}: AgentChatPanelProps) {
  return (
    <div className="agent-chat-panel">
      <div className="agent-chat-panel__header">
        <div>
          <span className="feature-page__kicker">Agent</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="agent-chat-panel__status">
        <span>{status}</span>
        <span>{workflow.nodes.length} nodes live</span>
      </div>

      <div className="agent-chat-panel__messages">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`agent-chat-panel__message agent-chat-panel__message--${message.role}`}
          >
            <div className="agent-chat-panel__message-meta">
              <strong>{message.role === 'assistant' ? 'Agent' : 'You'}</strong>
              <span>{message.timestamp}</span>
            </div>
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <label className="agent-chat-panel__composer">
        <span>Instruction</span>
        <textarea
          data-testid={composerTestId}
          rows={4}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder='Try "use a female voice and generate 4 retention-optimized variants".'
        />
      </label>

      <div className="agent-chat-panel__actions">
        <button
          className="btn btn--primary btn--sm"
          data-testid={sendTestId}
          type="button"
          onClick={onSend}
          disabled={isBusy || !draft.trim()}
        >
          {isBusy ? 'Applying…' : 'Apply and run'}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onExportWorkflow}>
          Export workflow JSON
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onExportPlan} disabled={!executionPlan}>
          Export execution plan
        </button>
      </div>

      {error ? <p className="agent-chat-panel__error">{error}</p> : null}

      {response ? (
        <div className="agent-chat-panel__insights">
          <div className="agent-chat-panel__card">
            <span>Validation</span>
            <strong>{response.validation.ok ? 'Ready to apply' : 'Blocked'}</strong>
            <p>
              {response.validation.ok
                ? `Planner returned ${response.actions.length} validated actions.`
                : response.validation.issues.join(' ')}
            </p>
          </div>

          <div className="agent-chat-panel__card">
            <span>Retrieval</span>
            <strong>{response.retrievalHits.length} context hit(s)</strong>
            <p>
              {response.retrievalHits.length
                ? response.retrievalHits
                    .slice(0, 2)
                    .map((hit) => `${hit.kind}: ${hit.text}`)
                    .join(' • ')
                : 'No stored memories were needed for this command.'}
            </p>
          </div>

          <div className="agent-chat-panel__card">
            <span>Execution</span>
            <strong>{response.execution.shouldRun ? 'Auto-run armed' : 'Graph-only update'}</strong>
            <p>{response.execution.notes.join(' ') || 'Execution path mirrors the current manual workflow.'}</p>
          </div>

          {response.customBlocks.length ? (
            <div className="agent-chat-panel__section">
              <h3>Custom blocks</h3>
              <div className="agent-chat-panel__list">
                {response.customBlocks.map((block) => (
                  <article className="agent-chat-panel__list-item" key={block.blockId}>
                    <strong>{block.blockName}</strong>
                    <span>{block.description}</span>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="agent-chat-panel__section">
            <h3>Planned actions</h3>
            <div className="agent-chat-panel__list">
              {response.actions.map((action) => (
                <article className="agent-chat-panel__list-item" key={action.id}>
                  <strong>{action.type}</strong>
                  <span>{action.reason}</span>
                </article>
              ))}
            </div>
          </div>

          {response.candidates.length ? (
            <div className="agent-chat-panel__section">
              <h3>Candidate leaderboard</h3>
              <div className="agent-chat-panel__list">
                {response.candidates.map((candidate) => (
                  <article
                    className={`agent-chat-panel__candidate ${
                      response.optimization.selectedCandidateId === candidate.id
                        ? 'agent-chat-panel__candidate--selected'
                        : ''
                    }`}
                    key={candidate.id}
                  >
                    <div>
                      <strong>{candidate.label}</strong>
                      <span>{candidate.summary}</span>
                    </div>
                    <span>{formatPercent(candidate.scoreBreakdown.overall)}</span>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
