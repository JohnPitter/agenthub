import { create } from "zustand";
import { api } from "../lib/utils";
import type { Team, TeamMember, TeamInvite } from "@agenthub/shared";

interface TeamState {
  teams: Team[];
  activeTeamId: string | null;
  members: TeamMember[];
  invites: TeamInvite[];
  loading: boolean;

  fetchTeams: () => Promise<void>;
  setActiveTeam: (id: string | null) => void;
  createTeam: (name: string) => Promise<Team>;
  fetchMembers: (teamId: string) => Promise<void>;
  inviteMember: (teamId: string, email: string, role: string) => Promise<void>;
  removeMember: (teamId: string, userId: string) => Promise<void>;
  updateMemberRole: (teamId: string, userId: string, role: string) => Promise<void>;
}

const ACTIVE_TEAM_KEY = "agenthub:activeTeamId";

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: [],
  activeTeamId: localStorage.getItem(ACTIVE_TEAM_KEY),
  members: [],
  invites: [],
  loading: false,

  fetchTeams: async () => {
    set({ loading: true });
    try {
      const data = await api<{ teams: Team[] }>("/teams");
      set({ teams: data.teams });
    } catch {
      // ignore
    } finally {
      set({ loading: false });
    }
  },

  setActiveTeam: (id) => {
    if (id) {
      localStorage.setItem(ACTIVE_TEAM_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_TEAM_KEY);
    }
    set({ activeTeamId: id });
  },

  createTeam: async (name) => {
    const data = await api<{ team: Team }>("/teams", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    set((s) => ({ teams: [...s.teams, data.team] }));
    return data.team;
  },

  fetchMembers: async (teamId) => {
    try {
      const data = await api<{ members: TeamMember[]; invites?: TeamInvite[] }>(
        `/teams/${teamId}/members`
      );
      set({ members: data.members, invites: data.invites ?? [] });
    } catch {
      // ignore
    }
  },

  inviteMember: async (teamId, email, role) => {
    await api(`/teams/${teamId}/invite`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    // Refresh members to pick up new invite
    await get().fetchMembers(teamId);
  },

  removeMember: async (teamId, userId) => {
    await api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" });
    set((s) => ({ members: s.members.filter((m) => m.userId !== userId) }));
  },

  updateMemberRole: async (teamId, userId, role) => {
    await api(`/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    set((s) => ({
      members: s.members.map((m) =>
        m.userId === userId ? { ...m, role: role as TeamMember["role"] } : m
      ),
    }));
  },
}));
