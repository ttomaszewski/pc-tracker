import { chromium } from "playwright";
import { loadState, saveState } from "./state";
import { sendDiscordAlert } from "./discord";
import { Product } from "./types";

const BASE_URL = "https://www.pokemoncenter.com/category/tcg-cards";
const PAGE_SIZE = 96;
const MAX_PAGES = 20;

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = await context.newPage();

  const previousState = await loadState();
  const newState = { ...previousState };

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?ps=${PAGE_SIZE}&page=${pageNum}`;
    console.log(`🔍 Checking page ${pageNum}`);

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000); // human-like delay

    // Grab all JSON-LD scripts with product info
    const jsonLdHandles = await page.$$(
      'script[type="application/ld+json"]'
    );

    let products: Product[] = [];

    for (const handle of jsonLdHandles) {
      const text = await handle.textContent();
      if (!text) continue;

      try {
        const data = JSON.parse(text);

        // Sometimes JSON-LD is an array, sometimes a single object
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item["@type"] === "Product" && item.offers) {
            const product: Product = {
              name: item.name,
              url: item.offers.url || item.url,
              inStock:
                item.offers.availability ===
                "http://schema.org/InStock",
            };
            products.push(product);
          }
        }
      } catch (e) {
        // ignore invalid JSON
      }
    }

    if (products.length === 0) {
      console.log("✅ No more products found, stopping.");
      break;
    }

    for (const product of products) {
      const prev = previousState[product.url];

      // SOLD OUT → IN STOCK
      if (prev && !prev.inStock && product.inStock) {
        console.log(`🟢 ALERT: ${product.name}`);
        await sendDiscordAlert(product);
      }

      newState[product.url] = {
        name: product.name,
        inStock: product.inStock,
      };
    }
  }

  await saveState(newState);
  await browser.close();
})();
