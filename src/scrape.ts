import { chromium } from "playwright";
import { loadState, saveState } from "./state";
import { sendDiscordAlert } from "./discord";
import { Product } from "./types";

const BASE_URL =
  "https://www.pokemoncenter.com/category/tcg-cards";

const PAGE_SIZE = 96;
const MAX_PAGES = 20;

(async () => {
  const browser = await chromium.launch({
    headless: false, // IMPORTANT: avoids bot detection
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York"
  });

  const page = await context.newPage();

  const previousState = await loadState();
  const newState = { ...previousState };

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?ps=${PAGE_SIZE}&page=${pageNum}`;
    console.log(`🔍 Checking page ${pageNum}`);

    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Human-like delay (critical)
    await page.waitForTimeout(3000);
    await page.mouse.move(200, 200);

    // Detect verification page
    const verificationDetected =
      (await page.locator("text=verifying").count()) > 0 ||
      (await page.locator("text=verify").count()) > 0;

    if (verificationDetected) {
      console.log("⚠️ Verification page detected, waiting...");
      await page.waitForTimeout(10000);
    }

    const products: Product[] = await page.$$eval(
      'a[href*="/product/"]',
      (links) => {
        const seen = new Set<string>();

        return links
          .map((link) => {
            const card = link.closest("div");
            if (!card) return null;

            const name =
              card.querySelector("span")?.textContent?.trim() ??
              "Unknown Product";

            const soldOut = card.textContent
              ?.toLowerCase()
              .includes("sold out");

            const url = (link as HTMLAnchorElement).href;

            if (seen.has(url)) return null;
            seen.add(url);

            return {
              name,
              url,
              inStock: !soldOut
            };
          })
          .filter(Boolean) as Product[];
      }
    );

    if (products.length === 0) {
      console.log("✅ No more pages, stopping.");
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
        inStock: product.inStock
      };
    }
  }

  await saveState(newState);
  await browser.close();
})();
