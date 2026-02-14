export interface Project {
  id: string;
  name: string;
  path: string;
  stack: string[];
  icon: string | null;
  description: string | null;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export interface ScannedProject {
  name: string;
  path: string;
  stack: string[];
  icon: string;
}
