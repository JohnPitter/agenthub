import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, FolderPlus, Github, Lock, Globe, Loader2 } from "lucide-react";
import { api } from "../../lib/utils";
import { cn } from "../../lib/utils";
import type { Project } from "@agenthub/shared";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function CreateProjectDialog({ open, onClose, onCreated }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const resetAndClose = () => {
    setName("");
    setDescription("");
    setIsPrivate(false);
    setError("");
    onClose();
  };

  const handleSubmit = async () => {
    setError("");

    if (!name.trim()) {
      setError(t("createProject.errorNameRequired"));
      return;
    }

    setCreating(true);
    try {
      const { project } = await api<{ project: Project }>("/projects/create", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          isPrivate,
        }),
      });
      onCreated(project);
      resetAndClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "errorDuplicate") setError(t("createProject.errorDuplicate"));
      else if (msg === "errorRepoExists") setError(t("createProject.errorRepoExists"));
      else if (msg === "errorCloneFailed") setError(t("createProject.errorCloneFailed"));
      else if (msg === "errorNameRequired") setError(t("createProject.errorNameRequired"));
      else if (msg.includes("github_reauth") || msg.includes("Session expired")) setError(t("createProject.errorTokenExpired"));
      else setError(msg || t("common.error"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={resetAndClose} />

      <div className="relative w-full max-w-md rounded-xl bg-neutral-bg1 border border-stroke shadow-16 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke px-6 py-4">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="h-4.5 w-4.5 text-brand" />
            <h2 className="text-[14px] font-semibold text-neutral-fg1">{t("createProject.title")}</h2>
          </div>
          <button
            onClick={resetAndClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* GitHub indicator */}
        <div className="flex items-center gap-2 border-b border-stroke px-6 py-2.5 bg-neutral-bg-hover">
          <Github className="h-3.5 w-3.5 text-neutral-fg3" />
          <span className="text-[11px] font-medium text-neutral-fg3">{t("projects.createOnGithub")}</span>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-danger-light px-3 py-2 text-[12px] font-medium text-danger">
              {error}
            </div>
          )}

          {/* Repo name */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-neutral-fg2">
              {t("projects.repoName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("createProject.namePlaceholder")}
              className="w-full input-fluent text-[13px]"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-neutral-fg2">
              {t("projects.repoDescription")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("createProject.descriptionPlaceholder")}
              rows={3}
              className="w-full input-fluent text-[13px] resize-none"
            />
          </div>

          {/* Private toggle */}
          <button
            type="button"
            onClick={() => setIsPrivate(!isPrivate)}
            className="flex items-center gap-3 rounded-lg border border-stroke px-3 py-2.5 hover:bg-neutral-bg-hover transition-colors"
          >
            {isPrivate ? (
              <Lock className="h-4 w-4 text-warning" />
            ) : (
              <Globe className="h-4 w-4 text-neutral-fg3" />
            )}
            <div className="text-left">
              <p className="text-[13px] font-medium text-neutral-fg1">
                {isPrivate ? t("projects.repoPrivate") : t("projects.repoPublic")}
              </p>
              <p className="text-[11px] text-neutral-fg3">{t("createProject.privateDesc")}</p>
            </div>
            <div
              className={cn(
                "ml-auto h-5 w-9 rounded-full transition-colors relative",
                isPrivate ? "bg-brand" : "bg-neutral-bg3",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
                  isPrivate ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-stroke px-6 py-4">
          <button
            onClick={resetAndClose}
            className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-fg2 hover:bg-neutral-bg-hover transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={creating}
            className="btn-primary flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("createProject.creating")}
              </>
            ) : (
              <>
                <Github className="h-3.5 w-3.5" />
                {t("projects.createOnGithub")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
