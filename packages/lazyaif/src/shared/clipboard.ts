import { execFileSync } from "node:child_process";

function shouldLog(): boolean {
  return process.env.DEBUG != null || process.env.LOG_LEVEL === "debug";
}

function debug(msg: string): void {
  if (shouldLog()) console.debug(msg);
}

type Platform = "wsl" | "macos" | "linux" | "windows" | "unknown";

function detectPlatform(): Platform {
  const platform = process.platform;
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  if (platform === "linux") {
    try {
      const release = execFileSync("uname", ["-r"], { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).toLowerCase();
      if (release.includes("microsoft") || release.includes("wsl")) return "wsl";
    } catch {
      /* ignore */
    }
    return "linux";
  }
  return "unknown";
}

function tryCopy(command: string, args: string[], text: string): boolean {
  try {
    execFileSync(command, args, {
      input: text,
      encoding: "utf-8",
      stdio: ["pipe", "ignore", "ignore"],
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

export function copyToClipboard(text: string): boolean {
  const platform = detectPlatform();
  debug(`[clipboard] platform=${platform} textLen=${text.length}`);

  if (platform === "wsl") {
    return tryCopy("/mnt/c/Windows/System32/clip.exe", [], text);
  }
  if (platform === "windows") {
    return tryCopy("clip", [], text);
  }
  if (platform === "macos") {
    return tryCopy("pbcopy", [], text);
  }
  if (platform === "linux") {
    if (tryCopy("wl-copy", [], text)) return true;
    if (tryCopy("xclip", ["-selection", "clipboard"], text)) return true;
    if (tryCopy("xsel", ["-b", "-i"], text)) return true;
    return false;
  }
  return false;
}