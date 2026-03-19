CREATE INDEX "messages_project_id_idx" ON "messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "messages_task_id_idx" ON "messages" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_project_id_idx" ON "notifications" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_logs_task_id_idx" ON "task_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_logs_created_at_idx" ON "task_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_assigned_agent_id_idx" ON "tasks" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks" USING btree ("parent_task_id");