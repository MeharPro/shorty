import { useState, type ReactNode } from 'react';

export interface WorkflowSidebarTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface WorkflowSidebarTabsProps {
  className?: string;
  defaultTabId?: string;
  tabs: WorkflowSidebarTab[];
}

export function WorkflowSidebarTabs({
  className,
  defaultTabId,
  tabs,
}: WorkflowSidebarTabsProps) {
  const [activeTabId, setActiveTabId] = useState(defaultTabId ?? tabs[0]?.id ?? '');
  const resolvedActiveTabId = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : defaultTabId ?? tabs[0]?.id ?? '';
  const activeTab = tabs.find((tab) => tab.id === resolvedActiveTabId) ?? tabs[0];

  return (
    <div className={className}>
      <div className="workflow-sidebar-tabs__rail" role="tablist" aria-label="Workflow sidebar tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`workflow-sidebar-tabs__tab ${
              activeTab?.id === tab.id ? 'workflow-sidebar-tabs__tab--active' : ''
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab?.id === tab.id}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="workflow-sidebar-tabs__panel">{activeTab?.content}</div>
    </div>
  );
}
