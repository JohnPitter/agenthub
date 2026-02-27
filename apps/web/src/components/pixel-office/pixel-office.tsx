import type { Task, Agent } from "@agenthub/shared";
import { PixelOfficeCanvas } from "./pixel-office-canvas";

interface PixelOfficeProps {
  tasks: Task[];
  projectFilter: string;
  agentMap: Map<string, Agent>;
  agentActivity: Map<string, {
    status: string;
    taskId?: string;
    currentTask?: string;
    currentFile?: string;
    lastActivity: number;
    progress: number;
  }>;
  onTaskClick: (task: Task) => void;
}

export function PixelOffice(props: PixelOfficeProps) {
  return (
    <div className="flex flex-col w-full h-full bg-neutral-950 p-6 overscroll-none">
      {/* Header section */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Agent Operations
          </h1>
          <p className="text-sm font-medium text-neutral-400 mt-1">
            Real-time visualization of agent workloads and office layout
          </p>
        </div>

        {/* Optional toolbar placeholding */}
        <div className="flex items-center space-x-3 bg-neutral-900/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wide text-neutral-300 uppercase">Live Match</span>
          </div>
        </div>
      </div>

      {/* Main canvas container with elegant framing */}
      <div className="relative flex-1 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#111827] shadow-black/50 group">

        {/* Subtle inner glow effect */}
        <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-white/5 z-10" />

        <PixelOfficeCanvas {...props} />

        {/* Floating controls hint overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2.5 bg-neutral-900/80 backdrop-blur-xl rounded-full border border-white/10 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 bg-black/50 rounded-md text-xs font-mono text-neutral-400 font-bold border border-white/5 shadow-inner">Click</div>
            <span className="text-sm text-neutral-300">agent to view task</span>
          </div>
        </div>

      </div>
    </div>
  );
}
