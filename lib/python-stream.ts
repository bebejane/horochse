import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { StreamPayload } from "./types";

const execFileAsync = promisify(execFile);
const SCRIPT = path.join(process.cwd(), "scripts", "stream.py");

export async function pythonStream(args: string[]): Promise<StreamPayload> {
  try {
    const { stdout } = await execFileAsync("python3", [SCRIPT, ...args], {
      timeout: 25000,
      cwd: process.cwd(),
      maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout) as StreamPayload;
  } catch (err) {
    const execErr = err as { stdout?: string; message?: string };
    if (execErr.stdout) {
      try {
        return JSON.parse(execErr.stdout) as StreamPayload;
      } catch {
        /* ignore */
      }
    }
    return { error: execErr.message || "Ingen stream hittades." };
  }
}
