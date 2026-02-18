export type SkillCategory = "coding" | "testing" | "review" | "docs" | "devops" | "custom";

export interface Skill {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  category: SkillCategory;
  instructions: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSkill {
  id: string;
  agentId: string;
  skillId: string;
  createdAt: Date;
}
