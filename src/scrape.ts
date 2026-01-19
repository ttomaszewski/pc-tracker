import { chromium } from "playwright";
import { loadState, saveState } from "./state";
import { sendDiscordAlert } from "./discord";
import { Product, ProductState } from "./types";

const BASE_URL = "https://www.pokemoncenter.com/category/tcg-cards";
const PAGE_SIZE = 96;
const MAX_PAGES = 20;

(async () => {
  console.log("🚀 Starting scraper...");

  const browser = await chromium.launch({
    headless: false, // run headed to avoid bot detection
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

  // Load previous state
  const previousState: ProductState = await loadState();
  console.log("💾 Previous state loaded:", Object.keys(previousState).length, "items");

  // Initialize newState as full Products
  const newState: Record<string, Product> = {};
  for (const url in previousState) {
    newState[url] = { ...previousState[url], url };
  }

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?ps=${PAGE_SIZE}&page=${pageNum}`;
    console.log(`\n🔍 Checking page ${pageNum}: ${url}`);

    await page.goto(url, { waitUntil: "networkidle" });
    console.log("⏳ Page loaded, waiting 2s for initial content...");
    await page.waitForTimeout(2000);

    // Scroll to bottom to trigger lazy load
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(5000);
    console.log("⏳ Scrolled page, waiting 5s for JSON-LD scripts...");

    // Grab all product containers dynamically
    const products: Product[] = await page.$$eval(
      'div[class*="product--"]',
      divs =>
        divs
          .map(div => {
            try {
              const script = div.querySelector('script[type="application/ld+json"]');
              if (!script) return null;

              const data = JSON.parse(script.textContent || "{}");
              if (data["@type"] !== "Product" || !data.offers) return null;

              return {
                name: data.name,
                url: data.offers.url || data.url,
                inStock: data.offers.availability === "http://schema.org/InStock",
              };
            } catch (err) {
              return null;
            }
          })
          .filter(Boolean)
    );

    console.log(`📦 Found ${products.length} products on page ${pageNum}`);

    if (products.length === 0) {
      console.log("✅ No products found, stopping.");
      break;
    }

    // Compare with previous state and send alerts
    for (const product of products) {
      const prev = previousState[product.url];

      if (prev && !prev.inStock && product.inStock) {
        console.log(`🟢 ALERT: ${product.name} is back in stock!`);
        await sendDiscordAlert(product);
      } else {
        console.log(`ℹ️ ${product.name}: ${product.inStock ? "In Stock" : "Sold Out"}`);
      }

      // Save to new state
      newState[product.url] = product;
    }
  }

  // Save state
  await saveState(newState);
  console.log("💾 State saved to ./state.json");

  await browser.close();
  console.log("🛑 Browser closing...");
  console.log("✅ Scraper finished");
})();
