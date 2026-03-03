import { useState, useEffect, useCallback } from "react";
import { Terminal, Keyboard, Mouse, ArrowUpDown } from "lucide-react";
import { api } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace-store";
import { AgentSidebar } from "../components/sidebar/AgentSidebar";
import { TerminalInfoBar } from "../components/terminal/TerminalInfoBar";
import { TerminalStatusBar } from "../components/terminal/TerminalStatusBar";
import { TerminalView } from "../components/terminal/TerminalView";

export function Dashboard() {
  const agents = useWorkspaceStore((s) => s.agents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [cliVersion, setCliVersion] = useState<string | null>(null);
  const [contextUsage, setContextUsage] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  // Fetch CLI version on mount
  useEffect(() => {
    api<{ version: string }>("/system/version")
      .then((data) => setCliVersion(data.version))
      .catch(() => setCliVersion(null));
  }, []);

  // Reset context usage when switching agents
  useEffect(() => {
    setContextUsage(null);
  }, [selectedAgentId]);

  const handleContextUsage = useCallback((usage: string | null) => {
    setContextUsage(usage);
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <AgentSidebar
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {selectedAgent ? (
          <>
            <TerminalInfoBar agent={selectedAgent} contextUsage={contextUsage} />
            <TerminalView
              agentId={selectedAgent.id}
              onContextUsage={handleContextUsage}
            />
            <TerminalStatusBar cliVersion={cliVersion} />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0a0a12]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-6">
        <Terminal className="h-8 w-8 text-white/20" />
      </div>
      <h2 className="text-[16px] font-semibold text-white/40 mb-2">
        Select an agent to begin
      </h2>
      <p className="text-[13px] text-white/20 mb-8">
        Choose an agent from the sidebar to view its terminal output
      </p>

      {/* Keyboard hints */}
      <div className="flex flex-col gap-2 text-[12px]">
        <div className="flex items-center gap-3 text-white/15">
          <Keyboard className="h-3.5 w-3.5" />
          <span>
            <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-mono">Ctrl</kbd>
            {" + "}
            <kbd className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-mono">K</kbd>
            {" Command palette"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-white/15">
          <Mouse className="h-3.5 w-3.5" />
          <span>Click an agent to open its terminal</span>
        </div>
        <div className="flex items-center gap-3 text-white/15">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>Scroll terminal output to review history</span>
        </div>
      </div>
    </div>
  );
}
