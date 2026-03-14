export interface StorageUsage {
  usedMb: number;
  limitMb: number;
  usedPercent: number;
  projectCount: number;
  maxProjects: number;
  repoTtlDays: number;
}

export interface StorageQuota {
  maxStorageMb: number;
  maxProjects: number;
  repoTtlDays: number;
}
