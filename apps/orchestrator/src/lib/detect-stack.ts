import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Detect the tech stack of a project by checking for common config files.
 * Returns an array of technology identifiers (e.g., ["nodejs", "react", "typescript"]).
 */
export function detectStack(projectPath: string): string[] {
  const stack: string[] = [];

  try {
    const files = readdirSync(projectPath);

    if (files.includes("package.json")) {
      stack.push("nodejs");
      try {
        const pkg = JSON.parse(readFileSync(join(projectPath, "package.json"), "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps["next"]) stack.push("nextjs");
        if (allDeps["react"]) stack.push("react");
        if (allDeps["vue"]) stack.push("vue");
        if (allDeps["svelte"]) stack.push("svelte");
        if (allDeps["@angular/core"]) stack.push("angular");
        if (allDeps["tailwindcss"]) stack.push("tailwind");
        if (allDeps["express"]) stack.push("express");
        if (allDeps["typescript"]) stack.push("typescript");
      } catch {
        // Ignore JSON parse errors
      }
    }

    if (files.includes("go.mod")) stack.push("go");
    if (files.includes("Cargo.toml")) stack.push("rust");
    if (files.includes("requirements.txt") || files.includes("pyproject.toml")) stack.push("python");
    if (files.includes("pom.xml") || files.includes("build.gradle")) stack.push("java");
    if (files.some((f) => f.endsWith(".sln") || f.endsWith(".csproj"))) stack.push("dotnet");
  } catch {
    // Ignore read errors for inaccessible directories
  }

  return stack;
}
