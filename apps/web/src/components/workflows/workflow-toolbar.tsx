import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Save,
  CheckCircle,
  Play,
  Bot,
  GitFork,
  Zap,
  Merge,
  Loader2,
  ChevronDown,
  Star,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { WorkflowNodeType, Workflow } from "@agenthub/shared";

interface WorkflowToolbarProps {
  workflowName: string;
  onNameChange: (name: string) => void;
  onAddNode: (type: WorkflowNodeType) => void;
  onValidate: () => void;
  onSimulate: () => void;
  onSave: () => void;
  saving: boolean;
  workflows: Workflow[];
  activeWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  onSetDefault: (id: string) => void;
  isDefault: boolean;
}

const NODE_TYPE_ITEMS: Array<{
  type: WorkflowNodeType;
  icon: typeof Bot;
  colorClass: string;
}> = [
  { type: "agent", icon: Bot, colorClass: "text-success-dark" },
  { type: "condition", icon: GitFork, colorClass: "text-warning" },
  { type: "parallel", icon: Zap, colorClass: "text-info" },
  { type: "merge", icon: Merge, colorClass: "text-purple-600" },
];

export function WorkflowToolbar({
  workflowName,
  onNameChange,
  onAddNode,
  onValidate,
  onSimulate,
  onSave,
  saving,
  workflows,
  activeWorkflowId,
  onSelectWorkflow,
  onSetDefault,
  isDefault,
}: WorkflowToolbarProps) {
  const { t } = useTranslation();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-stroke2 bg-neutral-bg-subtle px-5 py-2.5">
      {/* Workflow name */}
      <input
        value={workflowName}
        onChange={(e) => onNameChange(e.target.value)}
        className="bg-transparent text-[14px] font-semibold text-neutral-fg1 outline-none border-b border-transparent focus:border-brand transition-colors w-48"
        placeholder={t("workflow.namePlaceholder", "Nome do workflow")}
      />

      {/* Workflow selector */}
      {workflows.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 rounded-md bg-neutral-bg2 px-2.5 py-1.5 text-[12px] text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 w-56 rounded-lg border border-stroke2 bg-neutral-bg1 shadow-16 py-1">
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => {
                      onSelectWorkflow(wf.id);
                      setShowDropdown(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-left text-[12px] transition-colors",
                      wf.id === activeWorkflowId
                        ? "bg-brand-light text-brand"
                        : "text-neutral-fg2 hover:bg-neutral-bg-hover",
                    )}
                  >
                    {wf.isDefault && <Star className="h-3 w-3 text-warning" />}
                    <span className="truncate flex-1">{wf.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Default badge / button */}
      {isDefault ? (
        <span className="flex items-center gap-1 rounded-md bg-warning-light px-2 py-1 text-[10px] font-semibold text-warning">
          <Star className="h-3 w-3" />
          {t("workflow.default", "Padrao")}
        </span>
      ) : activeWorkflowId ? (
        <button
          onClick={() => onSetDefault(activeWorkflowId)}
          className="flex items-center gap-1 rounded-md bg-neutral-bg2 px-2 py-1 text-[10px] font-medium text-neutral-fg3 hover:bg-warning-light hover:text-warning transition-colors"
        >
          <Star className="h-3 w-3" />
          {t("workflow.setDefault", "Definir padrao")}
        </button>
      ) : null}

      {/* Separator */}
      <div className="h-5 w-px bg-stroke2" />

      {/* Add node buttons */}
      {NODE_TYPE_ITEMS.map(({ type, icon: Icon, colorClass }) => (
        <button
          key={type}
          onClick={() => onAddNode(type)}
          className="flex items-center gap-1.5 rounded-md bg-neutral-bg2 px-2.5 py-1.5 text-[11px] font-medium text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors"
          title={t(`workflow.addNodeType.${type}`, `Add ${type}`)}
        >
          <Icon className={cn("h-3.5 w-3.5", colorClass)} />
          {t(`workflow.nodeType.${type}`, type)}
        </button>
      ))}

      {/* Separator */}
      <div className="h-5 w-px bg-stroke2" />

      {/* Validate */}
      <button
        onClick={onValidate}
        className="flex items-center gap-1.5 rounded-md bg-neutral-bg2 px-3 py-1.5 text-[11px] font-medium text-neutral-fg2 hover:bg-success-light hover:text-success-dark transition-colors"
      >
        <CheckCircle className="h-3.5 w-3.5" />
        {t("workflow.validate", "Validar")}
      </button>

      {/* Simulate */}
      <button
        onClick={onSimulate}
        className="flex items-center gap-1.5 rounded-md bg-neutral-bg2 px-3 py-1.5 text-[11px] font-medium text-neutral-fg2 hover:bg-info-light hover:text-info transition-colors"
      >
        <Play className="h-3.5 w-3.5" />
        {t("workflow.simulate", "Simular")}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {t("workflow.save", "Salvar")}
      </button>
    </div>
  );
}
