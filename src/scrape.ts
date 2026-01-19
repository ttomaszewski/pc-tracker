import { chromium } from "playwright";
import { loadState, saveState } from "./state";
import { sendDiscordAlert } from "./discord";
import { Product } from "./types";

const BASE_URL = "https://www.pokemoncenter.com/category/tcg-cards";
const PAGE_SIZE = 96;
const MAX_PAGES = 20;

(async () => {
  console.log("🚀 Starting scraper...");

  const browser = await chromium.launch({
    headless: false, // headed mode for bot evasion
    args: ["--disable-blink-features=AutomationControlled"],
  });
  console.log("🖥 Chromium launched in headed mode");

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  console.log("🌐 Browser context created");

  const page = await context.newPage();
  console.log("📄 New page opened");

  const previousState: Record<string, Product> = await loadState();
  console.log("💾 Previous state loaded:", Object.keys(previousState).length, "items");

  const newState: Record<string, Product> = { ...previousState };

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?ps=${PAGE_SIZE}&page=${pageNum}`;
    console.log(`🔍 Checking page ${pageNum}: ${url}`);

    await page.goto(url, { waitUntil: "networkidle" });
    console.log("⏳ Page loaded, waiting 2s for lazy content...");
    await page.waitForTimeout(2000);

    const jsonLdHandles = await page.$$(
      'script[type="application/ld+json"]'
    );
    console.log(`📄 Found ${jsonLdHandles.length} JSON-LD scripts`);

    let products: Product[] = [];

    for (const handle of jsonLdHandles) {
      const text = await handle.textContent();
      if (!text) continue;

      try {
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item["@type"] === "Product" && item.offers) {
            const product: Product = {
              name: item.name,
              url: item.offers.url || item.url, // must include url
              inStock:
                item.offers.availability === "http://schema.org/InStock",
            };
            products.push(product);
          }
        }
      } catch (e) {
        console.log("⚠️ Failed to parse JSON-LD:", e);
      }
    }

    console.log(`📦 Found ${products.length} products on page ${pageNum}`);

    if (products.length === 0) {
      console.log("✅ No more products found, stopping.");
      break;
    }

    for (const product of products) {
      const prev = previousState[product.url];

      if (prev && !prev.inStock && product.inStock) {
        console.log(`🟢 ALERT: ${product.name} is back in stock!`);
        await sendDiscordAlert(product);
      } else {
        console.log(`ℹ️ ${product.name}: ${product.inStock ? "In Stock" : "Sold Out"}`);
      }

      // Save full Product object to satisfy TypeScript
      newState[product.url] = {
        name: product.name,
        url: product.url,
        inStock: product.inStock,
      };
    }
  }

  await saveState(newState);
  console.log("💾 State saved:", Object.keys(newState).length, "products");

  await browser.close();
  console.log("🛑 Browser closed, scraper finished");
})();
