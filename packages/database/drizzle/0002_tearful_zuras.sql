ALTER TABLE "plans" ADD COLUMN "max_storage_mb" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "repo_ttl_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_accessed_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "disk_size_mb" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_shallow_clone" boolean DEFAULT true NOT NULL;