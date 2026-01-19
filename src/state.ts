import fs from "fs";
import { ProductState } from "./types";

const STATE_FILE = "./state.json";

export async function loadState(): Promise<ProductState> {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    const data = await fs.promises.readFile(STATE_FILE, "utf-8");
    return JSON.parse(data) as ProductState;
  } catch (err) {
    console.log("⚠️ Failed to load state:", err);
    return {};
  }
}

export async function saveState(state: ProductState): Promise<void> {
  try {
    await fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    console.log("💾 State saved to", STATE_FILE);
  } catch (err) {
    console.log("⚠️ Failed to save state:", err);
  }
}
