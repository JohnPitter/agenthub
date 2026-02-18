import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { Users, Shield, Crown, Eye, UserMinus, ChevronLeft, Mail, Clock } from "lucide-react";
import { useTeamStore } from "../../stores/team-store";
import { cn } from "../../lib/utils";
import { formatDate } from "../../lib/utils";
import type { TeamRole } from "@agenthub/shared";

const ROLE_ICONS: Record<TeamRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: Users,
  viewer: Eye,
};

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: "text-amber-500 bg-amber-500/10",
  admin: "text-purple-500 bg-purple-500/10",
  member: "text-brand bg-brand-light",
  viewer: "text-neutral-fg3 bg-neutral-bg3",
};

const ASSIGNABLE_ROLES: TeamRole[] = ["admin", "member", "viewer"];

export function TeamSettings() {
  const { t } = useTranslation();
  const { id: teamId } = useParams<{ id: string }>();
  const teams = useTeamStore((s) => s.teams);
  const members = useTeamStore((s) => s.members);
  const invites = useTeamStore((s) => s.invites);
  const fetchTeams = useTeamStore((s) => s.fetchTeams);
  const fetchMembers = useTeamStore((s) => s.fetchMembers);
  const inviteMember = useTeamStore((s) => s.inviteMember);
  const removeMember = useTeamStore((s) => s.removeMember);
  const updateMemberRole = useTeamStore((s) => s.updateMemberRole);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("member");
  const [sending, setSending] = useState(false);

  const team = teams.find((t) => t.id === teamId);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    if (teamId) fetchMembers(teamId);
  }, [teamId, fetchMembers]);

  // Check if current user is owner (first member with role "owner")
  const isOwner = members.some((m) => m.role === "owner");

  async function handleInvite() {
    if (!teamId || !inviteEmail.trim()) return;
    setSending(true);
    try {
      await inviteMember(teamId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setInviteRole("member");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!teamId) return;
    await removeMember(teamId, userId);
  }

  async function handleRoleChange(userId: string, role: string) {
    if (!teamId) return;
    await updateMemberRole(teamId, userId, role);
  }

  if (!team) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-fg3">{t("common.loading")}</p>
      </div>
    );
  }

  const pendingInvites = invites.filter((inv) => !inv.acceptedAt);

  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-fg3 hover:text-brand transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back")}
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light">
            <Users className="h-6 w-6 text-brand" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-neutral-fg1">{team.name}</h1>
            <p className="text-[12px] text-neutral-fg3">{t("teams.title")}</p>
          </div>
        </div>
      </div>

      {/* Members */}
      <section className="mb-8">
        <h2 className="mb-4 text-[14px] font-semibold text-neutral-fg1">
          {t("teams.members")}
          <span className="ml-2 text-[12px] font-normal text-neutral-fg3">
            ({members.length})
          </span>
        </h2>

        <div className="rounded-xl border border-stroke2 overflow-hidden">
          {members.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-neutral-fg3">
              {t("teams.noMembers")}
            </div>
          ) : (
            members.map((member) => {
              const RoleIcon = ROLE_ICONS[member.role];
              const roleColor = ROLE_COLORS[member.role];
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 border-b border-stroke2 last:border-b-0 px-4 py-3"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-bg3 text-[13px] font-semibold text-neutral-fg2 overflow-hidden">
                    {member.userAvatar ? (
                      <img src={member.userAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (member.userName ?? member.userLogin ?? "?").charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Name + login */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-neutral-fg1 truncate">
                      {member.userName ?? member.userLogin ?? "Unknown"}
                    </p>
                    {member.userLogin && (
                      <p className="text-[11px] text-neutral-fg-disabled truncate">
                        @{member.userLogin}
                      </p>
                    )}
                  </div>

                  {/* Role badge / dropdown */}
                  {isOwner && member.role !== "owner" ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                      className="rounded-md border border-stroke2 bg-neutral-bg3 px-2 py-1 text-[11px] font-medium text-neutral-fg2 focus:outline-none focus:border-brand/40"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{t(`teams.${r}`)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold", roleColor)}>
                      <RoleIcon className="h-3 w-3" strokeWidth={2} />
                      {t(`teams.${member.role}`)}
                    </span>
                  )}

                  {/* Remove button */}
                  {isOwner && member.role !== "owner" && (
                    <button
                      onClick={() => handleRemove(member.userId)}
                      className="rounded-md p-1.5 text-neutral-fg-disabled hover:bg-danger/10 hover:text-danger transition-colors"
                      title={t("teams.removeMember")}
                    >
                      <UserMinus className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Invite */}
      {isOwner && (
        <section className="mb-8">
          <h2 className="mb-4 text-[14px] font-semibold text-neutral-fg1">
            {t("teams.invite")}
          </h2>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-fg-disabled" strokeWidth={1.8} />
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                placeholder={t("teams.invitePlaceholder")}
                className="w-full rounded-lg border border-stroke2 bg-neutral-bg3 py-2 pl-9 pr-3 text-[13px] text-neutral-fg1 placeholder:text-neutral-fg-disabled focus:border-brand/40 focus:outline-none"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamRole)}
              className="rounded-lg border border-stroke2 bg-neutral-bg3 px-3 py-2 text-[13px] text-neutral-fg2 focus:outline-none focus:border-brand/40"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{t(`teams.${r}`)}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={sending || !inviteEmail.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {t("teams.sendInvite")}
            </button>
          </div>
        </section>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <section>
          <h2 className="mb-4 text-[14px] font-semibold text-neutral-fg1">
            {t("teams.pendingInvites")}
            <span className="ml-2 text-[12px] font-normal text-neutral-fg3">
              ({pendingInvites.length})
            </span>
          </h2>

          <div className="rounded-xl border border-stroke2 overflow-hidden">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 border-b border-stroke2 last:border-b-0 px-4 py-3"
              >
                <Mail className="h-4 w-4 shrink-0 text-neutral-fg-disabled" strokeWidth={1.8} />
                <span className="flex-1 text-[13px] text-neutral-fg2 truncate">
                  {inv.email}
                </span>
                <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", ROLE_COLORS[inv.role])}>
                  {t(`teams.${inv.role}`)}
                </span>
                <div className="flex items-center gap-1 text-[11px] text-neutral-fg-disabled">
                  <Clock className="h-3 w-3" strokeWidth={1.8} />
                  {formatDate(inv.expiresAt)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
