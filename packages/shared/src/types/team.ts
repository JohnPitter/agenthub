export type TeamRole = "owner" | "admin" | "member" | "viewer";

export interface Team {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
  // Joined user info
  userName?: string;
  userLogin?: string;
  userAvatar?: string;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
}
