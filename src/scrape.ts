import { chromium } from "playwright";
import { loadState, saveState } from "./state";
import { sendDiscordAlert } from "./discord";
import { Product, ProductState } from "./types";

const BASE_URL = "https://www.pokemoncenter.com/category/tcg-cards";
const PAGE_SIZE = 96;
const MAX_PAGES = 20;
const SCROLL_WAIT = 5000; // ms

(async () => {
  console.log("🚀 Starting scraper...");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
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
  console.log("🖥 Browser launched and page opened");

  const previousState = await loadState();
  console.log("💾 Previous state loaded:", Object.keys(previousState).length, "items");

  // Convert ProductState -> Record<string, Product>
  const newState: Record<string, Product> = {};
  for (const url in previousState) {
    const item = previousState[url];
    newState[url] = { ...item, url };
  }

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?ps=${PAGE_SIZE}&page=${pageNum}`;
    console.log(`🔍 Checking page ${pageNum}: ${url}`);

    await page.goto(url, { waitUntil: "networkidle" });
    console.log("⏳ Page loaded, waiting 2s for initial content...");
    await page.waitForTimeout(2000);

    // Scroll to bottom to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    console.log(`⏳ Scrolled page, waiting ${SCROLL_WAIT / 1000}s for JSON-LD scripts...`);
    await page.waitForTimeout(SCROLL_WAIT);

    const jsonLdHandles = await page.$$('script[type="application/ld+json"]');
    console.log(`📄 Found ${jsonLdHandles.length} JSON-LD scripts`);

    const products: Product[] = [];

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
              url: item.offers.url || item.url,
              inStock: item.offers.availability === "http://schema.org/InStock",
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
      console.log("✅ No products found, stopping.");
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

      newState[product.url] = product; // already includes url
    }
  }

  await saveState(
    Object.fromEntries(
      Object.values(newState).map(p => [p.url, { name: p.name, inStock: p.inStock }])
    )
  );

  console.log("🛑 Browser closing...");
  await browser.close();
  console.log("✅ Scraper finished");
})();
