#!/usr/bin/env node

/**
 * HTML Tag Extractor and High-Resolution Screenshot Tool
 * ======================================================
 * Navigates to a URL or local HTML file, extracts all matching elements
 * (default: <table>), preserves all typography, stylesheets, and images (such as flags/icons),
 * saves each as a standalone HTML file, and captures ultra-high-resolution PNG screenshots.
 *
 * Usage:
 *   node tools/extract_and_screenshot.mjs <url-or-file> [options]
 *
 * Options:
 *   --tag <tag>       HTML tag or CSS selector to extract (default: "table")
 *   --out <dir>       Output directory (default: "./extracted_elements")
 *   --limit <number>  Maximum number of elements to process (default: all)
 *   --scale <number>  Device scale factor for resolution (default: 4 for high-DPI)
 *   --width <number>  Viewport width in pixels (default: 1400)
 *   --padding <num>   Padding in pixels around element screenshot (default: 20)
 *   --help            Show this help message
 *
 * Example:
 *   node tools/extract_and_screenshot.mjs https://en.wikipedia.org/wiki/Fortune_Global_500 --tag table --limit 3
 */

import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findBrowserPath, captureScreenshot } from "./capture_screenshot.mjs";

// --- Parse CLI Arguments ---
const rawArgs = process.argv.slice(2);
let url = null;
let tag = "table";
let outDir = "./extracted_elements";
let limit = Infinity;
let scale = 4;
let viewportWidth = 1400;
let padding = 20;

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === "--tag" && rawArgs[i + 1]) {
    tag = rawArgs[++i];
  } else if (arg === "--out" && rawArgs[i + 1]) {
    outDir = rawArgs[++i];
  } else if (arg === "--limit" && rawArgs[i + 1]) {
    limit = parseInt(rawArgs[++i], 10);
  } else if (arg === "--scale" && rawArgs[i + 1]) {
    scale = parseFloat(rawArgs[++i]);
  } else if (arg === "--width" && rawArgs[i + 1]) {
    viewportWidth = parseInt(rawArgs[++i], 10);
  } else if (arg === "--padding" && rawArgs[i + 1]) {
    padding = parseInt(rawArgs[++i], 10);
  } else if (arg === "--help" || arg === "-h") {
    console.log(`
HTML Tag Extractor & High-Resolution Screenshot Tool
====================================================
Usage:
  node tools/extract_and_screenshot.mjs <url-or-file> [options]

Options:
  --tag <tag>       HTML tag or CSS selector to extract (default: "table")
  --out <dir>       Output directory for HTML & PNG files (default: "./extracted_elements")
  --limit <num>     Limit number of elements to extract (default: all)
  --scale <num>     Device scale factor for high-res PNG (default: 4)
  --width <num>     Viewport width (default: 1400)
  --padding <num>   Padding around element screenshot (default: 20)
  --help            Show help
`);
    process.exit(0);
  } else if (!arg.startsWith("--") && !url) {
    url = arg;
  }
}

if (!url) {
  console.error("Error: Please specify a URL or local HTML file.");
  console.error("Usage: node tools/extract_and_screenshot.mjs <url> [--tag table] [--out dir] [--limit 5]");
  process.exit(1);
}

// Resolve target URL or local file path
let targetUrl = url;
if (!/^https?:\/\//i.test(targetUrl)) {
  if (fs.existsSync(targetUrl)) {
    targetUrl = "file:///" + path.resolve(targetUrl).replace(/\\/g, "/");
  } else {
    targetUrl = "https://" + targetUrl;
  }
}

const browserExecutable = findBrowserPath();
if (!browserExecutable) {
  console.error("Error: Could not find Google Chrome or Microsoft Edge installed.");
  console.error("Please set CHROME_PATH or EDGE_PATH environment variable to your browser executable.");
  process.exit(1);
}

const resolvedOutDir = path.resolve(outDir);
if (!fs.existsSync(resolvedOutDir)) {
  fs.mkdirSync(resolvedOutDir, { recursive: true });
}

console.log("=".repeat(65));
console.log(" HTML Tag Extractor & High-Resolution Screenshot Tool");
console.log("=".repeat(65));
console.log(`Target URL       : ${targetUrl}`);
console.log(`Target Tag       : ${tag}`);
console.log(`Output Directory : ${resolvedOutDir}`);
console.log(`Device Scale     : ${scale}x (Ultra High-Resolution)`);
console.log(`Element Limit    : ${Number.isFinite(limit) ? limit : "All"}`);
console.log(`Browser          : ${browserExecutable}`);
console.log("=".repeat(65));

async function main() {
  console.log("\n[1/3] Launching browser & navigating to target...");
  const browser = await puppeteer.launch({
    executablePath: browserExecutable,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: 900, deviceScaleFactor: scale });

    console.log(`      Loading page: ${targetUrl}...`);
    await page.goto(targetUrl, {
      waitUntil: ["load", "networkidle2"],
      timeout: 60000,
    });

    const pageTitle = (await page.title()) || "page";
    console.log(`      Page loaded: "${pageTitle}"`);

    console.log(`\n[2/3] Extracting matching <${tag}> elements...`);
    const extractedData = await page.evaluate(
      ({ selector, maxItems, baseUrl }) => {
        // Collect page-level stylesheets and style blocks
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
          .map((el) => {
            if (el.tagName.toLowerCase() === "link") {
              const href = el.getAttribute("href");
              if (href) {
                const absoluteHref = new URL(href, baseUrl).href;
                return `<link rel="stylesheet" href="${absoluteHref}">`;
              }
            }
            return el.outerHTML;
          })
          .join("\n");

        const elements = Array.from(document.querySelectorAll(selector));
        const itemsToProcess = elements.slice(0, maxItems);

        function sanitizeName(text) {
          return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "_")
            .slice(0, 50);
        }

        const results = [];

        itemsToProcess.forEach((element, index) => {
          const clone = element.cloneNode(true);

          // Find caption or nearest preceding heading
          let caption = "";
          const captionEl = clone.querySelector("caption");
          if (captionEl && captionEl.innerText.trim()) {
            caption = captionEl.innerText.trim();
          } else {
            let prev = element.previousElementSibling;
            while (prev && !caption) {
              if (/^h[1-6]$/i.test(prev.tagName)) {
                caption = prev.innerText.trim();
                break;
              }
              prev = prev.previousElementSibling;
            }
          }

          // Fix <img> paths to absolute URLs and force eager loading
          const imgs = Array.from(clone.querySelectorAll("img"));
          imgs.forEach((img) => {
            img.removeAttribute("loading");
            img.setAttribute("loading", "eager");
            img.setAttribute("decoding", "sync");

            const src = img.getAttribute("src");
            if (src) {
              if (src.startsWith("//")) {
                img.setAttribute("src", "https:" + src);
              } else if (src.startsWith("/")) {
                img.setAttribute("src", new URL(src, baseUrl).href);
              }
            }

            const srcset = img.getAttribute("srcset");
            if (srcset) {
              const fixedSrcset = srcset
                .split(",")
                .map((part) => {
                  const trimmed = part.trim();
                  const [partUrl, descriptor] = trimmed.split(/\s+/);
                  let fixedUrl = partUrl;
                  if (partUrl.startsWith("//")) {
                    fixedUrl = "https:" + partUrl;
                  } else if (partUrl.startsWith("/")) {
                    fixedUrl = new URL(partUrl, baseUrl).href;
                  }
                  return descriptor ? `${fixedUrl} ${descriptor}` : fixedUrl;
                })
                .join(", ");
              img.setAttribute("srcset", fixedSrcset);
            }
          });

          // Convert relative links to absolute
          const links = Array.from(clone.querySelectorAll("a[href]"));
          links.forEach((a) => {
            const href = a.getAttribute("href");
            if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
              try {
                a.setAttribute("href", new URL(href, baseUrl).href);
              } catch {}
            }
          });

          const baseTag = clone.tagName.toLowerCase();
          const cleanCaption = caption ? sanitizeName(caption) : "";
          const fileSuffix = cleanCaption ? `_${cleanCaption}` : "";
          const paddedIndex = String(index + 1).padStart(2, "0");
          const fileNameBase = `${baseTag}_${paddedIndex}${fileSuffix}`;

          results.push({
            index: index + 1,
            tag: baseTag,
            caption: caption || `(Item ${index + 1})`,
            fileNameBase,
            html: clone.outerHTML,
          });
        });

        return {
          styles,
          totalFound: elements.length,
          items: results,
        };
      },
      { selector: tag, maxItems: limit, baseUrl: targetUrl },
    );

    console.log(`      Found ${extractedData.totalFound} matching <${tag}> element(s).`);
    console.log(`      Processing ${extractedData.items.length} element(s)...\n`);

    if (extractedData.items.length === 0) {
      console.log(`No <${tag}> elements found on ${targetUrl}.`);
      return;
    }

    console.log("[3/3] Saving standalone HTML files and capturing high-res PNG screenshots...");
    const report = [];

    for (const item of extractedData.items) {
      const htmlFileName = `${item.fileNameBase}.html`;
      const pngFileName = `${item.fileNameBase}.png`;
      const htmlFilePath = path.join(resolvedOutDir, htmlFileName);
      const pngFilePath = path.join(resolvedOutDir, pngFileName);

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${targetUrl}">
  ${extractedData.styles}
  <style>
    body {
      background-color: #ffffff;
      color: #202122;
      margin: 0;
      padding: 0;
      display: inline-block;
      min-width: fit-content;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .screenshot-container {
      display: inline-block;
      padding: ${padding}px;
      background-color: #ffffff;
      box-sizing: border-box;
      min-width: fit-content;
    }
  </style>
</head>
<body>
  <div class="screenshot-container">
    ${item.html}
  </div>
</body>
</html>`;

      fs.writeFileSync(htmlFilePath, fullHtml, "utf8");

      process.stdout.write(`  [${item.index}/${extractedData.items.length}] "${item.caption}" -> screenshot... `);

      try {
        await captureScreenshot(htmlFilePath, {
          outputFilePath: pngFilePath,
          deviceScaleFactor: scale,
          viewportWidth,
          selector: ".screenshot-container",
          browser,
        });
        console.log(`OK!`);
        report.push({
          index: item.index,
          caption: item.caption,
          htmlFile: htmlFileName,
          pngFile: pngFileName,
          status: "SUCCESS",
        });
      } catch (screenshotErr) {
        console.log(`FAILED! (${screenshotErr.message})`);
        report.push({
          index: item.index,
          caption: item.caption,
          htmlFile: htmlFileName,
          pngFile: pngFileName,
          status: `ERROR: ${screenshotErr.message}`,
        });
      }
    }

    console.log("\n" + "=".repeat(65));
    console.log(" Extraction & Screenshot Summary");
    console.log("=".repeat(65));
    console.log(`Output Directory: ${resolvedOutDir}`);
    console.log(`Total Processed : ${report.length}`);
    const successCount = report.filter((r) => r.status === "SUCCESS").length;
    console.log(`Success Count   : ${successCount}`);
    console.log("-".repeat(65));
    for (const r of report) {
      console.log(`  #${r.index}: ${r.caption}`);
      console.log(`      HTML: ${path.join(resolvedOutDir, r.htmlFile)}`);
      console.log(`      PNG : ${path.join(resolvedOutDir, r.pngFile)}`);
    }
    console.log("=".repeat(65));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal error during extraction:", err);
  process.exit(1);
});
