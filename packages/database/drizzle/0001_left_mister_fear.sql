CREATE TABLE "openrouter_config" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"enabled_models" jsonb DEFAULT '[]'::jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_projects" integer DEFAULT 5 NOT NULL,
	"max_tasks_per_month" integer DEFAULT 100 NOT NULL,
	"price_monthly" numeric(10, 2) DEFAULT '0' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_id" text;