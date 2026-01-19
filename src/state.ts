import fs from "fs";
import path from "path";
import { StateRecord } from "./types";

const STATE_FILE = path.resolve(__dirname, "state.json");

export async function loadState(): Promise<StateRecord> {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    const raw = await fs.promises.readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn("⚠️ Failed to parse state.json, starting fresh");
    return {};
  }
}

export async function saveState(state: StateRecord) {
  await fs.promises.writeFile(
    STATE_FILE,
    JSON.stringify(state, null, 2),
    "utf-8"
  );
}
