import { spawn } from "node:child_process";
import { PACKAGE_NAME } from "../utils/constants";

export const DEFAULT_DEEPSKY_SKILL_NAME = "deepsky-sustain";
export const DEFAULT_DEEPSKY_SKILL_INSTALL_LABEL = "all repository skills";
export const DEFAULT_DEEPSKY_SKILL_REPOSITORY_URL =
  "https://github.com/appfi5/deepsky-tools.git";
export const DEFAULT_SUPERISE_AGENT_SKILL_REPOSITORY_URL =
  "https://github.com/appfi5/superise-for-agent";
export const DEFAULT_SETUP_SKILL_INSTALL_LABEL = "Install skills";
export const DEFAULT_SETUP_SKILL_REPOSITORY_URLS = [
  DEFAULT_DEEPSKY_SKILL_REPOSITORY_URL,
  DEFAULT_SUPERISE_AGENT_SKILL_REPOSITORY_URL,
] as const;

export type SkillInstallCommandResult = {
  stdout: string;
  stderr: string;
};

export type SkillInstallExecutor = (
  command: string,
  args: string[],
) => Promise<SkillInstallCommandResult>;

export type InstallSkillFromRepositoryOptions = {
  repositoryUrl?: string;
  skillName?: string;
};

export type InstallSkillFromRepositoryResult = {
  packageName: string;
  repositoryUrl: string;
  skillName: string;
  command: string;
  global: true;
  copy: true;
  stdout: string;
  stderr: string;
};

export type InstallSkillsFromRepositoriesOptions = {
  repositoryUrls?: string[];
  skillName?: string;
};

export type InstallSkillsFromRepositoriesResult = {
  packageName: string;
  label: string;
  skillName: string;
  repositoryUrls: string[];
  commands: string[];
  repositories: InstallSkillFromRepositoryResult[];
  global: true;
  copy: true;
};

export async function installSkillFromRepository(
  options: InstallSkillFromRepositoryOptions = {},
  executor: SkillInstallExecutor = runCommand,
): Promise<InstallSkillFromRepositoryResult> {
  const repositoryUrl =
    options.repositoryUrl?.trim() || DEFAULT_DEEPSKY_SKILL_REPOSITORY_URL;
  const requestedSkillName = options.skillName?.trim();
  const skillName = requestedSkillName || DEFAULT_DEEPSKY_SKILL_INSTALL_LABEL;
  const npxArgs = [
    "--yes",
    "skills",
    "add",
    repositoryUrl,
    "--global",
    "--copy",
    "--yes",
  ];
  if (requestedSkillName) {
    npxArgs.splice(4, 0, "--skill", requestedSkillName);
  }
  const result = await executor("npx", npxArgs);

  return {
    packageName: PACKAGE_NAME,
    repositoryUrl,
    skillName,
    command: ["npx", ...npxArgs].join(" "),
    global: true,
    copy: true,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function installSkillsFromRepositories(
  options: InstallSkillsFromRepositoriesOptions = {},
  executor: SkillInstallExecutor = runCommand,
): Promise<InstallSkillsFromRepositoriesResult> {
  const repositoryUrls = normalizeRepositoryUrls(
    options.repositoryUrls?.length
      ? options.repositoryUrls
      : [...DEFAULT_SETUP_SKILL_REPOSITORY_URLS],
  );
  const repositories: InstallSkillFromRepositoryResult[] = [];

  for (const repositoryUrl of repositoryUrls) {
    repositories.push(
      await installSkillFromRepository(
        {
          repositoryUrl,
          skillName: options.skillName,
        },
        executor,
      ),
    );
  }

  return {
    packageName: PACKAGE_NAME,
    label: DEFAULT_SETUP_SKILL_INSTALL_LABEL,
    skillName: options.skillName?.trim() || "all skills",
    repositoryUrls,
    commands: repositories.map((repository) => repository.command),
    repositories,
    global: true,
    copy: true,
  };
}

async function runCommand(
  command: string,
  args: string[],
): Promise<SkillInstallCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stderr.trim() || stdout.trim() || `exit code ${code ?? "unknown"}`;
      reject(new Error(details));
    });
  });
}

function normalizeRepositoryUrls(repositoryUrls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const repositoryUrl of repositoryUrls) {
    const normalized = repositoryUrl.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
