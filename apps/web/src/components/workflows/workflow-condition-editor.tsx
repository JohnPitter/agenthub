import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Eye } from "lucide-react";
import type { WorkflowNode } from "@agenthub/shared";

interface WorkflowConditionEditorProps {
  node: WorkflowNode;
  onSave: (updates: Partial<WorkflowNode>) => void;
  onClose: () => void;
}

type ConditionField = "category" | "priority" | "status" | "assignedAgentId";
type ConditionOperator = "eq" | "neq" | "contains" | "not_contains" | "gt" | "lt";

const FIELDS: Array<{ value: ConditionField; labelKey: string }> = [
  { value: "category", labelKey: "workflow.condition.fieldCategory" },
  { value: "priority", labelKey: "workflow.condition.fieldPriority" },
  { value: "status", labelKey: "workflow.condition.fieldStatus" },
  { value: "assignedAgentId", labelKey: "workflow.condition.fieldAgent" },
];

const OPERATORS: Array<{ value: ConditionOperator; labelKey: string; symbol: string }> = [
  { value: "eq", labelKey: "workflow.condition.opEquals", symbol: "==" },
  { value: "neq", labelKey: "workflow.condition.opNotEquals", symbol: "!=" },
  { value: "contains", labelKey: "workflow.condition.opContains", symbol: "~=" },
  { value: "not_contains", labelKey: "workflow.condition.opNotContains", symbol: "!~" },
  { value: "gt", labelKey: "workflow.condition.opGt", symbol: ">" },
  { value: "lt", labelKey: "workflow.condition.opLt", symbol: "<" },
];

const FIELD_VALUES: Record<ConditionField, string[]> = {
  category: ["feature", "bug", "refactor", "test", "docs", "chore"],
  priority: ["low", "medium", "high", "urgent", "critical"],
  status: ["pending", "assigned", "in_progress", "review", "done", "failed"],
  assignedAgentId: [],
};

export function WorkflowConditionEditor({ node, onSave, onClose }: WorkflowConditionEditorProps) {
  const { t } = useTranslation();
  const [field, setField] = useState<ConditionField>(
    (node.conditionField as ConditionField) ?? "category",
  );
  const [operator, setOperator] = useState<ConditionOperator>(
    (node.conditionOperator as ConditionOperator) ?? "eq",
  );
  const [value, setValue] = useState(node.conditionValue ?? "");
  const [label, setLabel] = useState(node.label);

  const preview = `task.${field} ${OPERATORS.find((o) => o.value === operator)?.symbol ?? "=="} "${value}"`;

  const handleSave = () => {
    onSave({
      label,
      conditionField: field,
      conditionOperator: operator,
      conditionValue: value,
    });
    onClose();
  };

  const suggestedValues = FIELD_VALUES[field];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold text-neutral-fg1">
            {t("workflow.condition.title", "Editar Condicao")}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Label */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("workflow.condition.label", "Label")}
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              placeholder={t("workflow.condition.labelPlaceholder", "Ex: Verificar prioridade")}
            />
          </div>

          {/* Field */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("workflow.condition.field", "Campo")}
            </label>
            <select
              value={field}
              onChange={(e) => {
                setField(e.target.value as ConditionField);
                setValue("");
              }}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {t(f.labelKey, f.value)}
                </option>
              ))}
            </select>
          </div>

          {/* Operator */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("workflow.condition.operator", "Operador")}
            </label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as ConditionOperator)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {t(op.labelKey, op.value)} ({op.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("workflow.condition.value", "Valor")}
            </label>
            {suggestedValues.length > 0 ? (
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
              >
                <option value="">{t("workflow.condition.selectValue", "Selecionar...")}</option>
                {suggestedValues.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-md border border-stroke bg-neutral-bg2 px-3 py-2.5 text-[13px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
                placeholder={t("workflow.condition.valuePlaceholder", "Ex: high")}
              />
            )}
          </div>

          {/* Preview */}
          <div className="rounded-md bg-neutral-bg2 border border-stroke p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Eye className="h-3.5 w-3.5 text-neutral-fg3" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-fg3">
                {t("workflow.condition.preview", "Preview")}
              </span>
            </div>
            <code className="text-[12px] font-mono text-brand">
              {preview}
            </code>
          </div>

          {/* Actions */}
          <div className="mt-1 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-brand px-5 py-2 text-[13px] font-medium text-white transition-all hover:bg-brand-hover"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
