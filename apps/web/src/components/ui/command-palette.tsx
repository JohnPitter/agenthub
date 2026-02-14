import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Folder, CheckSquare, Users, Layout, ArrowRight } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { useTasks } from "../../hooks/use-tasks";
import { cn } from "../../lib/utils";
import type { Project, Agent, Task } from "@agenthub/shared";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  type: "project" | "task" | "agent" | "navigation";
  label: string;
  description?: string;
  action: () => void;
}

const NAVIGATION_ITEMS = [
  { id: "dashboard", label: "Dashboard", path: "/" },
  { id: "settings", label: "Configurações", path: "/settings" },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { projects, agents, activeProjectId } = useWorkspaceStore();
  const { tasks } = useTasks(activeProjectId ?? undefined);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build command list
  const commands = useMemo(() => {
    const items: CommandItem[] = [];

    // Projects
    projects.forEach((project) => {
      items.push({
        id: `project-${project.id}`,
        type: "project",
        label: project.name,
        description: project.path,
        action: () => {
          navigate(`/project/${project.id}`);
          onClose();
        },
      });
    });

    // Tasks (only if in a project)
    if (activeProjectId) {
      tasks.forEach((task) => {
        items.push({
          id: `task-${task.id}`,
          type: "task",
          label: task.title,
          description: task.status,
          action: () => {
            navigate(`/project/${activeProjectId}/tasks`);
            onClose();
          },
        });
      });
    }

    // Agents
    agents.forEach((agent) => {
      items.push({
        id: `agent-${agent.id}`,
        type: "agent",
        label: agent.name,
        description: agent.role,
        action: () => {
          if (activeProjectId) {
            navigate(`/project/${activeProjectId}/agents`);
          }
          onClose();
        },
      });
    });

    // Navigation
    NAVIGATION_ITEMS.forEach((navItem) => {
      items.push({
        id: `nav-${navItem.id}`,
        type: "navigation",
        label: navItem.label,
        action: () => {
          navigate(navItem.path);
          onClose();
        },
      });
    });

    return items;
  }, [projects, tasks, agents, activeProjectId, navigate, onClose]);

  // Filter commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery),
    );
  }, [commands, query]);

  // Group filtered commands
  const groupedCommands = useMemo(() => {
    const groups = {
      project: filteredCommands.filter((c) => c.type === "project"),
      task: filteredCommands.filter((c) => c.type === "task"),
      agent: filteredCommands.filter((c) => c.type === "agent"),
      navigation: filteredCommands.filter((c) => c.type === "navigation"),
    };
    return groups;
  }, [filteredCommands]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) selected.action();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredCommands, selectedIndex]);

  if (!open) return null;

  const GROUP_CONFIG = {
    project: { label: "Projetos", icon: Folder, color: "text-primary" },
    task: { label: "Tasks", icon: CheckSquare, color: "text-green" },
    agent: { label: "Agentes", icon: Users, color: "text-purple" },
    navigation: { label: "Navegação", icon: Layout, color: "text-blue" },
  };

  let globalIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-lg bg-white shadow-lg border border-edge-light overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-edge-light px-4 py-3">
          <Search className="h-5 w-5 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar projetos, tasks, agentes..."
            className="flex-1 text-[14px] text-text-primary placeholder-text-placeholder outline-none bg-transparent"
          />
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <Search className="h-10 w-10 text-text-placeholder mb-3" />
              <p className="text-[13px] text-text-tertiary">Nenhum resultado encontrado</p>
            </div>
          ) : (
            <>
              {(Object.entries(groupedCommands) as [keyof typeof groupedCommands, CommandItem[]][]).map(
                ([groupType, items]) => {
                  if (items.length === 0) return null;
                  const config = GROUP_CONFIG[groupType];
                  const Icon = config.icon;

                  return (
                    <div key={groupType} className="border-b border-edge-light last:border-0">
                      <div className="flex items-center gap-2 px-4 py-2 bg-surface-hover">
                        <Icon className={cn("h-3.5 w-3.5", config.color)} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                          {config.label}
                        </span>
                      </div>
                      {items.map((item) => {
                        const currentIndex = globalIndex++;
                        const isSelected = currentIndex === selectedIndex;

                        return (
                          <button
                            key={item.id}
                            onClick={item.action}
                            className={cn(
                              "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                              isSelected ? "bg-primary-light" : "hover:bg-surface-hover",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-text-primary truncate">
                                {item.label}
                              </p>
                              {item.description && (
                                <p className="text-[11px] text-text-tertiary truncate">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            {isSelected && <ArrowRight className="h-4 w-4 shrink-0 text-primary ml-3" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                },
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 border-t border-edge-light px-4 py-2 bg-surface-hover">
          <span className="text-[10px] text-text-placeholder">
            <kbd className="rounded bg-white px-1.5 py-0.5 border border-edge text-text-tertiary">Esc</kbd> para fechar
          </span>
          <span className="text-[10px] text-text-placeholder">
            <kbd className="rounded bg-white px-1.5 py-0.5 border border-edge text-text-tertiary">↑↓</kbd> para navegar
          </span>
          <span className="text-[10px] text-text-placeholder">
            <kbd className="rounded bg-white px-1.5 py-0.5 border border-edge text-text-tertiary">Enter</kbd> para selecionar
          </span>
        </div>
      </div>
    </div>
  );
}
