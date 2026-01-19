import axios from "axios";
import { Product } from "./types";

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function sendDiscordAlert(product: Product) {
  if (!WEBHOOK_URL) {
    console.warn("Discord webhook not set");
    return;
  }

  await axios.post(WEBHOOK_URL, {
    content: `🚨 **BACK IN STOCK**\n**${product.name}**\n${product.url}`
  });
}
