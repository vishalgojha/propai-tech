import { spawn } from "node:child_process";

export type WacliExecResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

type WacliOptions = {
  bin?: string;
  dryRun?: boolean;
};

export class WacliTool {
  private readonly bin: string;
  private readonly dryRun: boolean;

  constructor(options: WacliOptions = {}) {
    this.bin = options.bin || process.env.WACLI_BIN || "wacli";
    this.dryRun = options.dryRun ?? process.env.WACLI_DRY_RUN !== "false";
  }

  async sendText(to: string, message: string): Promise<WacliExecResult> {
    return this.exec(["send", "text", "--to", to, "--message", message]);
  }

  async listChats(query?: string, limit = 20): Promise<WacliExecResult> {
    const args = ["chats", "list", "--limit", String(limit), "--json"];
    if (query) args.push("--query", query);
    return this.exec(args);
  }

  async searchMessages(query: string, chat?: string, limit = 20): Promise<WacliExecResult> {
    const args = ["messages", "search", query, "--limit", String(limit), "--json"];
    if (chat) args.push("--chat", chat);
    return this.exec(args);
  }

  async doctor(): Promise<WacliExecResult> {
    return this.exec(["doctor"]);
  }

  private async exec(args: string[]): Promise<WacliExecResult> {
    const command = `${this.bin} ${args.map(escapeArg).join(" ")}`;
    if (this.dryRun) {
      return {
        ok: true,
        command,
        stdout: "WACLI_DRY_RUN=true, command not executed",
        stderr: "",
        exitCode: 0
      };
    }

    return new Promise((resolve) => {
      const child = spawn(this.bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (buf: Buffer) => {
        stdout += buf.toString();
      });

      child.stderr.on("data", (buf: Buffer) => {
        stderr += buf.toString();
      });

      child.on("error", (err) => {
        resolve({
          ok: false,
          command,
          stdout,
          stderr: `${stderr}${err.message}`,
          exitCode: -1
        });
      });

      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? -1
        });
      });
    });
  }
}

function escapeArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
