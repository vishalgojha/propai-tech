import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const level = process.env.LOG_LEVEL || "info";
const levels = ["debug", "info", "warn", "error"];

function shouldLog(lvl: string) {
  return levels.indexOf(lvl) >= levels.indexOf(level);
}

function writeLine(line: string) {
  const logPath = "C:/Users/Vishal Gopal Ojha/evolution-real-estate-agent/logs/audit";
  const file = `${logPath}/audit-${new Date().toISOString().slice(0, 10)}.log`;
  if (!existsSync(logPath)) mkdirSync(logPath, { recursive: true });
  appendFileSync(file, line + "\n", "utf8");
}

export const logger = {
  debug: (msg: string, meta: any = {}) => {
    if (!shouldLog("debug")) return;
    const line = JSON.stringify({ level: "debug", msg, meta, ts: new Date().toISOString() });
    console.log(line);
    writeLine(line);
  },
  info: (msg: string, meta: any = {}) => {
    if (!shouldLog("info")) return;
    const line = JSON.stringify({ level: "info", msg, meta, ts: new Date().toISOString() });
    console.log(line);
    writeLine(line);
  },
  warn: (msg: string, meta: any = {}) => {
    if (!shouldLog("warn")) return;
    const line = JSON.stringify({ level: "warn", msg, meta, ts: new Date().toISOString() });
    console.warn(line);
    writeLine(line);
  },
  error: (msg: string, meta: any = {}) => {
    const line = JSON.stringify({ level: "error", msg, meta, ts: new Date().toISOString() });
    console.error(line);
    writeLine(line);
  }
};
