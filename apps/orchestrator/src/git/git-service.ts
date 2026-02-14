import { execFileNoThrow } from "../lib/exec-file.js";

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

export class GitService {
  /**
   * Detect if a directory is a git repository
   */
  async detectGitRepo(projectPath: string): Promise<boolean> {
    const result = await execFileNoThrow("git", ["rev-parse", "--git-dir"], {
      cwd: projectPath,
    });
    return !result.error;
  }

  /**
   * Initialize a new git repository
   */
  async initGitRepo(projectPath: string): Promise<void> {
    await execFileNoThrow("git", ["init"], { cwd: projectPath });
  }

  /**
   * Get current git status (branch, staged, unstaged, untracked files)
   */
  async getGitStatus(projectPath: string): Promise<GitStatus> {
    // Get branch and tracking info
    const branchResult = await execFileNoThrow(
      "git",
      ["status", "--porcelain", "--branch"],
      { cwd: projectPath }
    );

    if (branchResult.error) {
      throw new Error(`Failed to get git status: ${branchResult.stderr}`);
    }

    const lines = branchResult.stdout.split("\n").filter((l) => l.trim());
    const branchLine = lines[0] || "";

    // Parse branch line: ## branch...origin/branch [ahead 1, behind 2]
    let branch = "main";
    let ahead = 0;
    let behind = 0;

    const branchMatch = branchLine.match(/## ([^\s.]+)/);
    if (branchMatch) {
      branch = branchMatch[1];
    }

    const aheadMatch = branchLine.match(/ahead (\d+)/);
    if (aheadMatch) {
      ahead = parseInt(aheadMatch[1], 10);
    }

    const behindMatch = branchLine.match(/behind (\d+)/);
    if (behindMatch) {
      behind = parseInt(behindMatch[1], 10);
    }

    // Parse file statuses
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const status = line.substring(0, 2);
      const filePath = line.substring(3);

      // Status codes: XY where X=index, Y=working tree
      const indexStatus = status[0];
      const workingTreeStatus = status[1];

      if (indexStatus === "?") {
        untracked.push(filePath);
      } else {
        if (indexStatus !== " " && indexStatus !== "?") {
          staged.push(filePath);
        }
        if (workingTreeStatus !== " " && workingTreeStatus !== "?") {
          unstaged.push(filePath);
        }
      }
    }

    return { branch, ahead, behind, staged, unstaged, untracked };
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(projectPath: string): Promise<string> {
    const result = await execFileNoThrow(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: projectPath }
    );

    if (result.error) {
      throw new Error(`Failed to get current branch: ${result.stderr}`);
    }

    return result.stdout.trim();
  }

  /**
   * Get remote origin URL
   */
  async getRemoteUrl(projectPath: string): Promise<string | null> {
    const result = await execFileNoThrow(
      "git",
      ["config", "--get", "remote.origin.url"],
      { cwd: projectPath }
    );

    return result.error ? null : result.stdout.trim();
  }

  /**
   * Get last commit info
   */
  async getLastCommit(projectPath: string): Promise<GitCommit | null> {
    const result = await execFileNoThrow(
      "git",
      ["log", "-1", "--format=%H|%s|%an|%aI"],
      { cwd: projectPath }
    );

    if (result.error || !result.stdout.trim()) {
      return null;
    }

    const [sha, message, author, dateStr] = result.stdout.trim().split("|");

    return {
      sha,
      message,
      author,
      date: new Date(dateStr),
    };
  }

  /**
   * Create a new branch
   */
  async createBranch(
    projectPath: string,
    branchName: string,
    baseBranch?: string
  ): Promise<void> {
    if (baseBranch) {
      await execFileNoThrow("git", ["checkout", baseBranch], {
        cwd: projectPath,
      });
    }

    const result = await execFileNoThrow("git", ["checkout", "-b", branchName], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to create branch: ${result.stderr}`);
    }
  }

  /**
   * Checkout a branch
   */
  async checkoutBranch(
    projectPath: string,
    branchName: string
  ): Promise<void> {
    const result = await execFileNoThrow("git", ["checkout", branchName], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to checkout branch: ${result.stderr}`);
    }
  }

  /**
   * Check if a branch exists
   */
  async branchExists(
    projectPath: string,
    branchName: string
  ): Promise<boolean> {
    const result = await execFileNoThrow("git", ["rev-parse", "--verify", branchName], {
      cwd: projectPath,
    });

    return !result.error;
  }

  /**
   * Stage all changes
   */
  async stageAll(projectPath: string): Promise<void> {
    const result = await execFileNoThrow("git", ["add", "."], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to stage changes: ${result.stderr}`);
    }
  }

  /**
   * Create a commit
   */
  async commit(
    projectPath: string,
    message: string,
    author?: string
  ): Promise<string> {
    const args = ["commit", "-m", message];
    if (author) {
      args.push("--author", author);
    }

    const result = await execFileNoThrow("git", args, { cwd: projectPath });

    if (result.error) {
      throw new Error(`Failed to commit: ${result.stderr}`);
    }

    // Extract SHA from commit
    const shaResult = await execFileNoThrow("git", ["rev-parse", "HEAD"], {
      cwd: projectPath,
    });

    if (shaResult.error) {
      throw new Error(`Failed to get commit SHA: ${shaResult.stderr}`);
    }

    return shaResult.stdout.trim();
  }

  /**
   * Push to remote with optional credentials
   */
  async push(
    projectPath: string,
    branch: string,
    remote = "origin",
    credentials?: {
      type: "ssh" | "https";
      sshKeyPath?: string;
      token?: string;
      username?: string;
    }
  ): Promise<void> {
    const env: Record<string, string> = { ...process.env };

    // Handle SSH key authentication
    if (credentials?.type === "ssh" && credentials.sshKeyPath) {
      env.GIT_SSH_COMMAND = `ssh -i ${credentials.sshKeyPath} -o StrictHostKeyChecking=no`;
    }

    // Handle HTTPS token authentication
    if (credentials?.type === "https" && credentials.token) {
      const remoteUrl = await this.getRemoteUrl(projectPath);
      if (remoteUrl) {
        // Inject token into URL temporarily
        const urlWithToken = remoteUrl.replace("https://", `https://${credentials.token}@`);
        await execFileNoThrow("git", ["remote", "set-url", remote, urlWithToken], {
          cwd: projectPath,
        });
      }
    }

    const result = await execFileNoThrow("git", ["push", remote, branch], {
      cwd: projectPath,
      timeout: 60000, // 60 seconds timeout for network operations
    });

    // Reset URL after push if we injected token
    if (credentials?.type === "https" && credentials.token) {
      const remoteUrl = await this.getRemoteUrl(projectPath);
      if (remoteUrl && remoteUrl.includes("@")) {
        // Remove token from URL
        const cleanUrl = remoteUrl.replace(/https:\/\/[^@]+@/, "https://");
        await execFileNoThrow("git", ["remote", "set-url", remote, cleanUrl], {
          cwd: projectPath,
        });
      }
    }

    if (result.error) {
      throw new Error(`Failed to push: ${result.stderr}`);
    }
  }

  /**
   * Get diff
   */
  async getDiff(projectPath: string, staged = false): Promise<string> {
    const args = staged ? ["diff", "--staged"] : ["diff"];
    const result = await execFileNoThrow("git", args, { cwd: projectPath });

    return result.stdout;
  }

  /**
   * Get list of changed files
   */
  async getChangedFiles(projectPath: string): Promise<string[]> {
    const result = await execFileNoThrow("git", ["status", "--porcelain"], {
      cwd: projectPath,
    });

    if (result.error) {
      return [];
    }

    return result.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.substring(3));
  }

  /**
   * Add a remote to the repository
   */
  async addRemote(
    projectPath: string,
    remoteUrl: string,
    remoteName = "origin"
  ): Promise<void> {
    const result = await execFileNoThrow("git", ["remote", "add", remoteName, remoteUrl], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to add remote: ${result.stderr}`);
    }
  }

  /**
   * Set remote URL
   */
  async setRemoteUrl(
    projectPath: string,
    remoteUrl: string,
    remoteName = "origin"
  ): Promise<void> {
    const result = await execFileNoThrow("git", ["remote", "set-url", remoteName, remoteUrl], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to set remote URL: ${result.stderr}`);
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(projectPath: string, remote = "origin"): Promise<void> {
    const result = await execFileNoThrow("git", ["fetch", remote], {
      cwd: projectPath,
      timeout: 30000, // 30 seconds timeout
    });

    if (result.error) {
      throw new Error(`Failed to fetch: ${result.stderr}`);
    }
  }

  /**
   * Get list of remote branches
   */
  async getRemoteBranches(
    projectPath: string,
    remote = "origin"
  ): Promise<string[]> {
    const result = await execFileNoThrow("git", ["branch", "-r"], {
      cwd: projectPath,
    });

    if (result.error) {
      return [];
    }

    return result.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.trim().replace(`${remote}/`, ""))
      .filter((branch) => !branch.includes("HEAD"));
  }

  /**
   * Get ahead/behind count compared to remote branch
   */
  async getAheadBehind(
    projectPath: string,
    branch: string,
    remote = "origin"
  ): Promise<{ ahead: number; behind: number }> {
    const result = await execFileNoThrow(
      "git",
      ["rev-list", "--left-right", "--count", `${branch}...${remote}/${branch}`],
      { cwd: projectPath }
    );

    if (result.error) {
      return { ahead: 0, behind: 0 };
    }

    const [aheadStr, behindStr] = result.stdout.trim().split("\t");
    const ahead = parseInt(aheadStr, 10) || 0;
    const behind = parseInt(behindStr, 10) || 0;

    return { ahead, behind };
  }

  /**
   * Pull from remote
   */
  async pull(
    projectPath: string,
    remote = "origin",
    branch?: string
  ): Promise<{ success: boolean; conflicts: boolean }> {
    const currentBranch = branch || (await this.getCurrentBranch(projectPath));

    const result = await execFileNoThrow("git", ["pull", remote, currentBranch], {
      cwd: projectPath,
      timeout: 60000,
    });

    if (result.error) {
      // Check if it's a conflict
      const conflicts =
        result.stderr.includes("CONFLICT") || result.stderr.includes("Merge conflict");
      return { success: false, conflicts };
    }

    return { success: true, conflicts: false };
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(projectPath: string): Promise<boolean> {
    const result = await execFileNoThrow("git", ["status", "--porcelain"], {
      cwd: projectPath,
    });

    return result.stdout.trim().length > 0;
  }

  /**
   * Stash uncommitted changes
   */
  async stash(projectPath: string, message = "Auto-stash before pull"): Promise<void> {
    const result = await execFileNoThrow("git", ["stash", "push", "-m", message], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to stash: ${result.stderr}`);
    }
  }

  /**
   * Pop stashed changes
   */
  async stashPop(projectPath: string): Promise<void> {
    const result = await execFileNoThrow("git", ["stash", "pop"], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to pop stash: ${result.stderr}`);
    }
  }

  /**
   * Get list of conflicted files
   */
  async getConflictedFiles(projectPath: string): Promise<string[]> {
    const result = await execFileNoThrow("git", ["diff", "--name-only", "--diff-filter=U"], {
      cwd: projectPath,
    });

    if (result.error) {
      return [];
    }

    return result.stdout.split("\n").filter((line) => line.trim());
  }

  /**
   * Get file content at a specific commit
   */
  async getFileAtCommit(
    projectPath: string,
    filePath: string,
    commitSha: string
  ): Promise<string> {
    const result = await execFileNoThrow("git", ["show", `${commitSha}:${filePath}`], {
      cwd: projectPath,
    });

    if (result.error) {
      throw new Error(`Failed to get file at commit: ${result.stderr}`);
    }

    return result.stdout;
  }

  /**
   * Get commit history for a specific file
   */
  async getFileHistory(
    projectPath: string,
    filePath: string,
    limit = 10
  ): Promise<GitCommit[]> {
    const result = await execFileNoThrow(
      "git",
      ["log", `--max-count=${limit}`, "--format=%H|%s|%an|%aI", "--", filePath],
      { cwd: projectPath }
    );

    if (result.error) {
      return [];
    }

    const commits: GitCommit[] = [];
    const lines = result.stdout.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const [sha, message, author, dateStr] = line.split("|");
      if (sha && message && author && dateStr) {
        commits.push({
          sha,
          message,
          author,
          date: new Date(dateStr),
        });
      }
    }

    return commits;
  }

  /**
   * Get diff between working tree and HEAD for a file
   */
  async getWorkingTreeDiff(projectPath: string, filePath: string): Promise<string> {
    const result = await execFileNoThrow("git", ["diff", "HEAD", "--", filePath], {
      cwd: projectPath,
    });

    return result.stdout;
  }

  /**
   * Get diff between two commits for a file
   */
  async getDiffBetweenCommits(
    projectPath: string,
    filePath: string,
    commit1: string,
    commit2: string
  ): Promise<string> {
    const result = await execFileNoThrow(
      "git",
      ["diff", commit1, commit2, "--", filePath],
      { cwd: projectPath }
    );

    return result.stdout;
  }
}
