import { chromium } from "playwright";
import { loadState, saveState } from "./state";
import { sendDiscordAlert } from "./discord";
import { Product } from "./types";

const BASE_URL =
  "https://www.pokemoncenter.com/category/tcg-cards";
const PAGE_SIZE = 96;
const MAX_PAGES = 20;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const previousState = await loadState();
  const newState = { ...previousState };

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?ps=${PAGE_SIZE}&page=${pageNum}`;
    console.log(`🔍 Checking page ${pageNum}`);

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

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
