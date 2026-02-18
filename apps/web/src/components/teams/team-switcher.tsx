import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, Users, User } from "lucide-react";
import { useTeamStore } from "../../stores/team-store";
import { cn } from "../../lib/utils";

export function TeamSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const teams = useTeamStore((s) => s.teams);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  const fetchTeams = useTeamStore((s) => s.fetchTeams);
  const createTeam = useTeamStore((s) => s.createTeam);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const team = await createTeam(name);
      setActiveTeam(team.id);
      setNewName("");
      setCreating(false);
      setOpen(false);
    } catch {
      // ignore
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setOpen(!open)}
        className="relative mx-auto mt-4 flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-bg3 text-neutral-fg2 hover:bg-brand-light hover:text-brand transition-all"
        title={activeTeam?.name ?? t("teams.personal")}
      >
        {activeTeam ? (
          <Users className="h-4 w-4" strokeWidth={1.8} />
        ) : (
          <User className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className="relative mx-7 mt-4">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[13px] font-medium transition-all",
          open
            ? "border-brand/40 bg-brand-light/10 text-neutral-fg1"
            : "border-stroke2 bg-neutral-bg3/50 text-neutral-fg2 hover:border-stroke-active hover:bg-neutral-bg3"
        )}
      >
        <div className="flex items-center gap-2.5 truncate">
          {activeTeam ? (
            <Users className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.8} />
          ) : (
            <User className="h-4 w-4 shrink-0 text-neutral-fg3" strokeWidth={1.8} />
          )}
          <span className="truncate">
            {activeTeam?.name ?? t("teams.personal")}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-neutral-fg3 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-lg border border-stroke2 bg-neutral-bg2 shadow-3 overflow-hidden">
          {/* Personal option */}
          <button
            onClick={() => {
              setActiveTeam(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] transition-all hover:bg-neutral-bg-hover",
              !activeTeamId && "bg-brand-light/10 text-brand font-semibold"
            )}
          >
            <User className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>{t("teams.personal")}</span>
          </button>

          {/* Team list */}
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => {
                setActiveTeam(team.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] transition-all hover:bg-neutral-bg-hover",
                activeTeamId === team.id && "bg-brand-light/10 text-brand font-semibold"
              )}
            >
              <Users className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="truncate">{team.name}</span>
            </button>
          ))}

          {/* Divider */}
          <div className="border-t border-stroke2" />

          {/* Create team */}
          {creating ? (
            <div className="p-2">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
                placeholder={t("teams.teamNamePlaceholder")}
                className="w-full rounded-md border border-stroke2 bg-neutral-bg3 px-2.5 py-1.5 text-[13px] text-neutral-fg1 placeholder:text-neutral-fg-disabled focus:border-brand/40 focus:outline-none"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={handleCreate}
                  className="flex-1 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-hover transition-colors"
                >
                  {t("common.create")}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="flex-1 rounded-md border border-stroke2 px-2 py-1 text-[11px] font-medium text-neutral-fg3 hover:bg-neutral-bg-hover transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-brand transition-all"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span>{t("teams.create")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
