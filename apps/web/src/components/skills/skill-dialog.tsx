import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Skill, SkillCategory } from "@agenthub/shared";

interface SkillDialogProps {
  skill?: Skill;
  onSave: (data: { name: string; description: string; category: SkillCategory; instructions: string; isActive: boolean }) => void;
  onClose: () => void;
}

const CATEGORIES: SkillCategory[] = ["coding", "testing", "review", "docs", "devops", "custom"];

export function SkillDialog({ skill, onSave, onClose }: SkillDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [category, setCategory] = useState<SkillCategory>(skill?.category ?? "custom");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [isActive, setIsActive] = useState(skill?.isActive ?? true);

  const canSave = name.trim().length > 0 && instructions.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      instructions: instructions.trim(),
      isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-neutral-fg1">
            {skill ? t("skills.edit") : t("skills.create")}
          </h2>
          <button onClick={onClose} className="rounded-md p-2 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("skills.name")} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("skills.name")}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("skills.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("skills.description")}
              rows={2}
              className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 placeholder-neutral-fg-disabled outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("skills.category")}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SkillCategory)}
              className="w-full rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[14px] text-neutral-fg1 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{t(`skills.categories.${cat}`)}</option>
              ))}
            </select>
          </div>

          {/* Instructions */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {t("skills.instructions")} *
            </label>
            <p className="mb-2 text-[11px] text-neutral-fg3">
              {t("skills.instructionsHint")}
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Write instructions that will be injected into the agent's system prompt..."
              rows={10}
              className="w-full resize-none rounded-md border border-stroke bg-neutral-bg2 px-4 py-3 text-[13px] text-neutral-fg1 placeholder-neutral-fg-disabled font-mono outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand-light"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-neutral-fg2">
              {isActive ? t("skills.active") : t("skills.inactive")}
            </label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={cn(
                "relative h-5 w-9 rounded-full transition-all duration-200",
                isActive ? "bg-brand" : "bg-stroke",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                  isActive && "left-[18px]",
                )}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-md px-5 py-2.5 text-[14px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cn(
                "rounded-md bg-brand px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-brand-hover",
                !canSave && "opacity-50 cursor-not-allowed",
              )}
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
