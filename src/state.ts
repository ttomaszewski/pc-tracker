import fs from "fs-extra";
import { ProductState } from "./types";

const STATE_FILE = "state.json";

export async function loadState(): Promise<ProductState> {
  if (!(await fs.pathExists(STATE_FILE))) return {};
  return fs.readJSON(STATE_FILE);
}

export async function saveState(state: ProductState) {
  await fs.writeJSON(STATE_FILE, state, { spaces: 2 });
}
