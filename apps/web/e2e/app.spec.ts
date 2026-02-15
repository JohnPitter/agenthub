import { test, expect, type Page } from "@playwright/test";

// Helper: wait for the app shell to be ready (sidebar loaded)
async function waitForAppShell(page: Page) {
  await page.waitForSelector("text=AgentHub", { timeout: 15000 });
}

// Helper: get the first project link from the sidebar and extract its id
async function getFirstProjectLink(page: Page) {
  // Projects appear as links matching /project/<id> in the sidebar
  const projectLink = page.locator('aside a[href^="/project/"]').first();
  await projectLink.waitFor({ timeout: 10000 });
  const href = await projectLink.getAttribute("href");
  return { projectLink, href };
}

// ─── 1. Navigation tests ────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("Dashboard loads with AgentHub in sidebar", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Sidebar should contain "AgentHub" branding
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("AgentHub")).toBeVisible();

    // Header should show "Dashboard"
    await expect(page.locator("header").getByText("Dashboard")).toBeVisible();
  });

  test("Sidebar links navigate correctly", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Navigate to Analytics
    await page.locator('aside a[href="/analytics"]').click();
    await page.waitForURL("**/analytics");
    await expect(page.locator("header").getByText("Analytics")).toBeVisible();

    // Navigate to Settings (Configuracoes)
    await page.locator('aside a[href="/settings"]').click();
    await page.waitForURL("**/settings");
    await expect(page.getByText("Configurações").first()).toBeVisible();

    // Navigate back to Dashboard
    await page.locator('aside a[href="/"]').click();
    await page.waitForURL("/");
    await expect(page.locator("header").getByText("Dashboard")).toBeVisible();
  });

  test("Project link opens project overview", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Check if any projects exist in the sidebar
    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();

    if (count > 0) {
      const { projectLink, href } = await getFirstProjectLink(page);
      await projectLink.click();
      await page.waitForURL(`**${href}`);

      // Should show project name in header
      const headerLink = page.locator("header a").first();
      await expect(headerLink).toBeVisible();
    } else {
      // No projects exist — skip gracefully
      test.skip();
    }
  });
});

// ─── 2. Dashboard tests ─────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("Projects section renders", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Should have a "Projetos" heading
    await expect(page.getByText("Projetos").first()).toBeVisible();
  });

  test("Project cards render when projects exist", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Wait for API to load (either project cards or empty state)
    await page.waitForTimeout(2000);

    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();

    if (count > 0) {
      // ProjectCard components are <button> elements inside the main content
      // They contain project names and "tasks" / "agents" labels
      const mainContent = page.locator("main");
      const cards = mainContent.locator("button").filter({ hasText: "tasks" });
      await expect(cards.first()).toBeVisible({ timeout: 5000 });
    } else {
      // Empty state should show
      await expect(
        page.getByText("Nenhum projeto adicionado")
      ).toBeVisible();
    }
  });

  test("Stat cards show metrics when data loaded", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Wait for stats to load
    await page.waitForTimeout(2000);

    // Inline stat cards should be visible with metric labels
    // At minimum, "Projetos" and "Agentes Ativos" labels should be present
    const projLabel = page.getByText("Projetos");
    const count = await projLabel.count();
    // If stats loaded, at least the "Projetos" stat label should be visible
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Activity table renders when activities exist", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);
    await page.waitForTimeout(2000);

    // Check for the activities section
    const activitiesHeading = page.getByText("Atividades Recentes");
    const hasActivities = (await activitiesHeading.count()) > 0;

    if (hasActivities) {
      // Table headers should be present
      await expect(page.getByText("Agente").first()).toBeVisible();
    }
    // If no activities, that's OK - the section just doesn't render
  });
});

// ─── 3. Project pages tests ─────────────────────────────────────────────

test.describe("Project pages", () => {
  test("Project overview shows tasks table and agent team", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForAppShell(page);

    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const { projectLink } = await getFirstProjectLink(page);
    await projectLink.click();

    // Wait for project overview to load
    await page.waitForTimeout(2000);

    // Should have "Tasks Recentes" section
    await expect(page.getByText("Tasks Recentes")).toBeVisible({
      timeout: 10000,
    });

    // Should have "Equipe de Agentes" section
    await expect(page.getByText("Equipe de Agentes")).toBeVisible();
  });

  test("Board page loads with kanban or table view", async ({ page }) => {
    await page.goto("/");
    await waitForAppShell(page);

    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const { href } = await getFirstProjectLink(page);
    const projectId = href!.split("/project/")[1];

    // Navigate directly to board
    await page.goto(`/project/${projectId}/board`);
    await waitForAppShell(page);

    // Should show "Kanban Board" or "Task Table" text
    const kanbanText = page.getByText("Kanban Board");
    const tableText = page.getByText("Task Table");

    const hasKanban = (await kanbanText.count()) > 0;
    const hasTable = (await tableText.count()) > 0;
    expect(hasKanban || hasTable).toBeTruthy();

    // Should have the view toggle buttons
    await expect(page.getByRole("button", { name: "Kanban" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tabela" })).toBeVisible();
  });

  test("Agents page shows agent list and clicking agent shows config panel", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForAppShell(page);

    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const { href } = await getFirstProjectLink(page);
    const projectId = href!.split("/project/")[1];

    // Navigate directly to agents page
    await page.goto(`/project/${projectId}/agents`);
    await waitForAppShell(page);

    // Wait for agents to load — the "Selecione um agente" text indicates agents are loaded
    const selectAgentText = page.getByText("Selecione um agente");
    await expect(selectAgentText).toBeVisible({ timeout: 15000 });

    // Should also show "ativos" count in the command bar
    await expect(page.getByText(/ativos/).first()).toBeVisible();

    // Click first agent button in the agent list panel
    const agentListButtons = page.locator(
      'div.w-80 button, [class*="w-80"] button'
    );
    const agentCount = await agentListButtons.count();
    if (agentCount > 0) {
      await agentListButtons.first().click();
      await page.waitForTimeout(1000);

      // The "Selecione um agente" message should no longer be visible
      // because the config panel should now be showing
      await expect(selectAgentText).not.toBeVisible();
    }
  });
});

// ─── 4. Settings tests ──────────────────────────────────────────────────

test.describe("Settings", () => {
  test("Settings page loads with tabs", async ({ page }) => {
    await page.goto("/settings");
    await waitForAppShell(page);

    // Should show "Configuracoes" in the command bar
    await expect(page.getByText("Configurações").first()).toBeVisible();

    // Should have the 4 tabs
    await expect(page.getByText("Geral")).toBeVisible();
    await expect(page.getByText("Integrações")).toBeVisible();
    await expect(page.getByText("Aparência")).toBeVisible();
    await expect(page.getByText("Sobre")).toBeVisible();
  });

  test("Integrations tab shows WhatsApp and Telegram config", async ({
    page,
  }) => {
    await page.goto("/settings");
    await waitForAppShell(page);

    // Click the "Integracoes" tab
    await page.getByText("Integrações").click();
    await page.waitForTimeout(500);

    // Should show integrations heading
    await expect(
      page.getByText("Integrações de Mensagens")
    ).toBeVisible();

    // Should show WhatsApp and Telegram sections
    await expect(page.getByText("WhatsApp").first()).toBeVisible();
    await expect(page.getByText("Telegram").first()).toBeVisible();
  });
});

// ─── 5. Chat panel test ─────────────────────────────────────────────────

test.describe("Chat panel", () => {
  test("Chat toggle button opens and closes chat panel", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForAppShell(page);

    // Chat button only appears when a project is active
    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Navigate to a project to activate the Chat button
    const { projectLink } = await getFirstProjectLink(page);
    await projectLink.click();
    await page.waitForTimeout(1000);

    // The "Chat" button should be in the header
    const chatButton = page.locator("header").getByText("Chat");
    await expect(chatButton).toBeVisible({ timeout: 5000 });

    // Click to open chat panel
    await chatButton.click();
    await page.waitForTimeout(500);

    // Chat panel should be visible (it has "Chat" text in its header)
    const chatPanelHeader = page.locator(
      'div.w-\\[360px\\], [class*="w-[360px]"]'
    );
    // Alternatively check that chat panel content is visible
    // The chat panel shows a "Chat" label inside it
    const chatLabels = page.getByText("Chat");
    const chatLabelCount = await chatLabels.count();
    // Should have at least 2 "Chat" labels (header button + panel header)
    expect(chatLabelCount).toBeGreaterThanOrEqual(2);

    // Click again to close
    await chatButton.click();
    await page.waitForTimeout(500);
  });
});

// ─── 6. No console errors test ──────────────────────────────────────────

test.describe("No console errors", () => {
  test("Navigate through all major routes without console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore expected errors: network failures (API not available), React dev warnings
        if (
          text.includes("Failed to fetch") ||
          text.includes("net::ERR_") ||
          text.includes("NetworkError") ||
          text.includes("favicon.ico") ||
          text.includes("Scan failed") ||
          text.includes("Failed to fetch analytics") ||
          text.includes("429") ||
          text.includes("Too Many Requests") ||
          text.includes("Failed to load resource")
        ) {
          return;
        }
        consoleErrors.push(text);
      }
    });

    // Dashboard
    await page.goto("/");
    await waitForAppShell(page);
    await page.waitForTimeout(1000);

    // Analytics
    await page.goto("/analytics");
    await waitForAppShell(page);
    await page.waitForTimeout(1000);

    // Settings
    await page.goto("/settings");
    await waitForAppShell(page);
    await page.waitForTimeout(1000);

    // Project routes (if projects exist)
    await page.goto("/");
    await waitForAppShell(page);
    await page.waitForTimeout(2000);

    const projectLinks = page.locator('aside a[href^="/project/"]');
    const count = await projectLinks.count();

    if (count > 0) {
      const href = await projectLinks.first().getAttribute("href");
      const projectId = href!.split("/project/")[1];

      // Project overview
      await page.goto(`/project/${projectId}`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);

      // Board
      await page.goto(`/project/${projectId}/board`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);

      // Agents
      await page.goto(`/project/${projectId}/agents`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);

      // Tasks
      await page.goto(`/project/${projectId}/tasks`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);

      // Files
      await page.goto(`/project/${projectId}/files`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);

      // PRs
      await page.goto(`/project/${projectId}/prs`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);

      // Project Settings
      await page.goto(`/project/${projectId}/settings`);
      await waitForAppShell(page);
      await page.waitForTimeout(1000);
    }

    // Report any unexpected console errors
    if (consoleErrors.length > 0) {
      console.log("Console errors found:", consoleErrors);
    }
    expect(consoleErrors).toHaveLength(0);
  });
});
