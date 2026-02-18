import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, Pencil, Trash2, Zap, Loader2 } from "lucide-react";
import { cn, api } from "../../lib/utils";
import { EmptyState } from "../ui/empty-state";
import { SkillDialog } from "./skill-dialog";
import type { Skill, SkillCategory } from "@agenthub/shared";

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  coding: { bg: "bg-blue-100", text: "text-blue-700" },
  testing: { bg: "bg-green-100", text: "text-green-700" },
  review: { bg: "bg-amber-100", text: "text-amber-700" },
  docs: { bg: "bg-purple-100", text: "text-purple-700" },
  devops: { bg: "bg-red-100", text: "text-red-700" },
  custom: { bg: "bg-neutral-100", text: "text-neutral-700" },
};

const ALL_CATEGORIES: (SkillCategory | "all")[] = ["all", "coding", "testing", "review", "docs", "devops", "custom"];

export function SkillList() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | "all">("all");
  const [dialogSkill, setDialogSkill] = useState<Skill | undefined>(undefined);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ skills: Skill[] }>("/skills");
      setSkills(data.skills);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleCreate = () => {
    setDialogSkill(undefined);
    setShowDialog(true);
  };

  const handleEdit = (skill: Skill) => {
    setDialogSkill(skill);
    setShowDialog(true);
  };

  const handleSave = async (data: { name: string; description: string; category: SkillCategory; instructions: string; isActive: boolean }) => {
    try {
      if (dialogSkill) {
        const updated = await api<{ skill: Skill }>(`/skills/${dialogSkill.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        setSkills((prev) => prev.map((s) => (s.id === dialogSkill.id ? updated.skill : s)));
      } else {
        const created = await api<{ skill: Skill }>("/skills", {
          method: "POST",
          body: JSON.stringify(data),
        });
        setSkills((prev) => [...prev, created.skill]);
      }
      setShowDialog(false);
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/skills/${id}`, { method: "DELETE" });
      setSkills((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
    } catch {
      // silent
    }
  };

  const handleToggleActive = async (skill: Skill) => {
    try {
      const updated = await api<{ skill: Skill }>(`/skills/${skill.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !skill.isActive }),
      });
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? updated.skill : s)));
    } catch {
      // silent
    }
  };

  const searchLower = search.toLowerCase();
  const filtered = skills.filter((s) => {
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    if (search && !s.name.toLowerCase().includes(searchLower) && !s.category.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col gap-6 animate-fade-up">
        <div>
          <h3 className="text-title text-neutral-fg1 mb-1">{t("skills.title")}</h3>
        </div>
        <EmptyState
          icon={Zap}
          title={t("skills.emptyTitle")}
          description={t("skills.emptyDesc")}
          action={{
            label: t("skills.create"),
            onClick: handleCreate,
            icon: Plus,
          }}
        />
        {showDialog && (
          <SkillDialog
            skill={dialogSkill}
            onSave={handleSave}
            onClose={() => setShowDialog(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <div>
        <h3 className="text-title text-neutral-fg1 mb-1">{t("skills.title")}</h3>
      </div>

      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-fg3" />
          <input
            type="text"
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-stroke2 bg-neutral-bg1 py-2 pl-9 pr-3 text-[13px] text-neutral-fg1 placeholder:text-neutral-fg-disabled focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <button
          onClick={handleCreate}
          className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          {t("skills.create")}
        </button>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {ALL_CATEGORIES.map((cat) => {
          const isActive = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                isActive
                  ? "bg-brand text-white"
                  : "bg-neutral-bg2 text-neutral-fg3 hover:bg-stroke2 hover:text-neutral-fg2",
              )}
            >
              {t(`skills.categories.${cat}`)}
            </button>
          );
        })}
      </div>

      {/* Skills grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Search className="h-8 w-8 text-neutral-fg-disabled" />
          <p className="text-[13px] text-neutral-fg3">{t("common.noResults")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((skill) => {
            const colors = CATEGORY_COLORS[skill.category] ?? CATEGORY_COLORS.custom;
            return (
              <div
                key={skill.id}
                className="border border-stroke2 rounded-lg overflow-hidden transition-all hover:shadow-2"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-neutral-bg1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                      colors.bg,
                      colors.text,
                    )}
                  >
                    {t(`skills.categories.${skill.category}`)}
                  </span>
                  <span className="flex-1 truncate text-[13px] font-semibold text-neutral-fg1">
                    {skill.name}
                  </span>
                  {skill.description && (
                    <span className="hidden sm:block text-[12px] text-neutral-fg3 truncate max-w-[200px]">
                      {skill.description}
                    </span>
                  )}

                  {/* Active toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(skill)}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-all duration-200 shrink-0",
                      skill.isActive ? "bg-brand" : "bg-stroke",
                    )}
                    title={skill.isActive ? t("skills.active") : t("skills.inactive")}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200",
                        skill.isActive && "left-[18px]",
                      )}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => handleEdit(skill)}
                    className="rounded-md p-1.5 text-neutral-fg3 transition-colors hover:bg-neutral-bg-hover hover:text-neutral-fg1"
                    title={t("skills.edit")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteConfirm(skill.id)}
                    className="rounded-md p-1.5 text-neutral-fg3 transition-colors hover:bg-danger/10 hover:text-danger"
                    title={t("skills.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skill dialog */}
      {showDialog && (
        <SkillDialog
          skill={dialogSkill}
          onSave={handleSave}
          onClose={() => setShowDialog(false)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirm(null)}>
          <div
            className="w-full max-w-sm rounded-lg bg-neutral-bg1 p-6 shadow-16 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[14px] text-neutral-fg1 mb-4">{t("skills.deleteConfirm")}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-fg2 transition-colors hover:bg-neutral-bg-hover"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-md bg-danger px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-danger/90"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
