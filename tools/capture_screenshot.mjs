#!/usr/bin/env node

/**
 * High-Resolution Screenshot Tool
 * ===============================
 * Captures ultra-high-DPI PNG screenshots from SVG files, HTML files, or live URLs
 * using a local Chrome or Edge browser (via puppeteer-core).
 *
 * Usage:
 *   node tools/capture_screenshot.mjs <file.svg|file.html|url> [options]
 *
 * Options:
 *   --out <path>       Destination PNG file path
 *   --scale <num>      Device scale factor (default: 4 for ultra-sharp high-DPI)
 *   --width <num>      Viewport width (default: 1200)
 *   --height <num>     Viewport height (default: 800)
 *   --selector <sel>   Element selector to clip to (default: auto-detects .screenshot-container, svg, or table)
 *   --full-page        Capture full page instead of element
 *   --help             Show this help message
 */

import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findBrowserPath } from "./browser_utils.mjs";

export { findBrowserPath };

/**
 * Capture high-resolution screenshot of an SVG file, HTML file, or URL.
 *
 * @param {string} inputSource - Path to SVG/HTML file, or HTTP/HTTPS URL
 * @param {object} [options]
 * @param {string} [options.outputFilePath] - Destination PNG path
 * @param {number} [options.deviceScaleFactor=4] - Scale factor for high resolution
 * @param {number} [options.viewportWidth=1200]
 * @param {number} [options.viewportHeight=800]
 * @param {string} [options.selector] - Specific element selector to clip to
 * @param {boolean} [options.fullPage=false] - Force full page screenshot
 * @param {import('puppeteer-core').Browser} [options.browser] - Existing Puppeteer browser
 * @returns {Promise<string>} Saved output PNG path
 */
export async function captureScreenshot(inputSource, options = {}) {
  const isUrl = /^https?:\/\//i.test(inputSource);
  let defaultOutName = "screenshot.png";

  if (!isUrl) {
    const ext = path.extname(inputSource);
    const base = path.basename(inputSource, ext);
    defaultOutName = path.join(path.dirname(inputSource), `${base}.png`);
  }

  const { outputFilePath = defaultOutName, deviceScaleFactor = 4, viewportWidth = 1200, viewportHeight = 800, selector = null, fullPage = false } = options;

  let browser = options.browser;
  let ownBrowser = false;

  if (!browser) {
    const executablePath = findBrowserPath();
    if (!executablePath) {
      throw new Error("Could not find Google Chrome or Microsoft Edge installed.\n" + "Please install Chrome/Edge or set the CHROME_PATH or EDGE_PATH environment variable.");
    }
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    ownBrowser = true;
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor,
    });

    const targetUrl = isUrl ? inputSource : "file:///" + path.resolve(inputSource).replace(/\\/g, "/");

    await page.goto(targetUrl, { waitUntil: ["load", "networkidle2"], timeout: 60000 });

    // Wait for fonts and images to load completely
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        img.removeAttribute("loading");
        img.setAttribute("loading", "eager");
        if (img.getAttribute("src")?.startsWith("//")) {
          img.setAttribute("src", "https:" + img.getAttribute("src"));
        }
      }

      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
            setTimeout(resolve, 3000);
          });
        }),
      );
    });

    // Ensure output directory exists
    const dir = path.dirname(outputFilePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Determine target element or full page
    let targetElement = null;
    if (!fullPage) {
      if (selector) {
        targetElement = await page.$(selector);
      }
      if (!targetElement) {
        targetElement = await page.$(".screenshot-container, svg, table");
      }

      // If targetElement has a .screenshot-container parent, clip to the container
      if (targetElement) {
        const containerHandle = await page.evaluateHandle((el) => el.closest(".screenshot-container") || el, targetElement);
        const containerEl = containerHandle.asElement();
        if (containerEl) {
          targetElement = containerEl;
        }
      }
    }

    let screenshotBuffer;
    if (targetElement && !fullPage) {
      screenshotBuffer = await targetElement.screenshot({ type: "png" });
    } else {
      screenshotBuffer = await page.screenshot({ type: "png", fullPage: true });
    }

    try {
      fs.writeFileSync(outputFilePath, screenshotBuffer);
    } catch {
      // Windows transient lock retry
      await new Promise((r) => setTimeout(r, 250));
      fs.writeFileSync(outputFilePath, screenshotBuffer);
    }

    return outputFilePath;
  } finally {
    if (ownBrowser && browser) {
      await browser.close();
    }
  }
}

// --- CLI Execution ---
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const rawArgs = process.argv.slice(2);
  let inputSource = null;
  let outputFilePath = null;
  let scale = 4;
  let width = 1200;
  let height = 800;
  let selector = null;
  let fullPage = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--out" && rawArgs[i + 1]) {
      outputFilePath = rawArgs[++i];
    } else if (arg === "--scale" && rawArgs[i + 1]) {
      scale = parseFloat(rawArgs[++i]);
    } else if (arg === "--width" && rawArgs[i + 1]) {
      width = parseInt(rawArgs[++i], 10);
    } else if (arg === "--height" && rawArgs[i + 1]) {
      height = parseInt(rawArgs[++i], 10);
    } else if (arg === "--selector" && rawArgs[i + 1]) {
      selector = rawArgs[++i];
    } else if (arg === "--full-page") {
      fullPage = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
High-Resolution Screenshot Tool
===============================
Captures ultra-high-DPI PNGs from SVG, HTML, or URLs.

Usage:
  node tools/capture_screenshot.mjs <file.svg|file.html|url> [options]

Options:
  --out <path>       Destination PNG file path
  --scale <num>      Device scale factor (default: 4)
  --width <num>      Viewport width in px (default: 1200)
  --height <num>     Viewport height in px (default: 800)
  --selector <sel>   CSS selector to screenshot (e.g. 'table.wikitable', 'svg')
  --full-page        Capture full scrollable page
  --help             Show help
`);
      process.exit(0);
    } else if (!arg.startsWith("--") && !inputSource) {
      inputSource = arg;
    }
  }

  if (!inputSource) {
    console.error("Error: Please specify an SVG file, HTML file, or URL.");
    console.error("Usage: node tools/capture_screenshot.mjs <file.svg|file.html|url> [--out image.png] [--scale 4]");
    process.exit(1);
  }

  try {
    const savedPath = await captureScreenshot(inputSource, {
      outputFilePath: outputFilePath || undefined,
      deviceScaleFactor: scale,
      viewportWidth: width,
      viewportHeight: height,
      selector,
      fullPage,
    });
    console.log(`Saved screenshot to: ${savedPath}`);
  } catch (err) {
    console.error("Error capturing screenshot:", err.message);
    process.exit(1);
  }
}
