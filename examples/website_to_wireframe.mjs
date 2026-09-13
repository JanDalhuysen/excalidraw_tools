#!/usr/bin/env node

/**
 * Website to Wireframe Generator
 * ==============================
 * Deterministically extracts semantic UI bounding boxes (cards, buttons, inputs,
 * media, headings, and text) from an HTML page or URL via a headless browser
 * sandbox and builds editable Excalidraw and tldraw wireframes using excalidraw-tools.
 *
 * Usage:
 *   node examples/website_to_wireframe.mjs <file.html|url> [options]
 *
 * Options:
 *   --out <name>       Base output filename (default: <input>-wireframe)
 *   --width <number>   Viewport width in pixels (default: 1280)
 *   --height <number>  Viewport height in pixels (default: 800)
 *   --help             Show this help message
 *
 * Examples:
 *   node examples/website_to_wireframe.mjs index.html --out my_wireframe
 *   node examples/website_to_wireframe.mjs https://example.com --width 1440
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

import puppeteer from "puppeteer-core";

import { fileURLToPath } from "url";
import { ExcalidrawDoc, COLORS, STROKE_STYLES } from "../excalidraw.mjs";
import { findBrowserPath } from "../tools/browser_utils.mjs";

function generateId() {
  return crypto.randomBytes(8).toString("hex");
}

// --- Parse CLI Arguments ---
const args = process.argv.slice(2);
let inputSource = null;
let outputBaseName = null;
let viewportWidth = 1280;
let viewportHeight = 800;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outputBaseName = args[++i];
  } else if (args[i] === "--width" && args[i + 1]) {
    viewportWidth = parseInt(args[++i], 10);
  } else if (args[i] === "--height" && args[i + 1]) {
    viewportHeight = parseInt(args[++i], 10);
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Website to Wireframe Generator
==============================
Converts any webpage or local HTML file into editable Excalidraw & tldraw wireframes.

Usage:
  node examples/website_to_wireframe.mjs <file.html|url> [options]

Options:
  --out <name>       Base output filename
  --width <num>      Viewport width (default: 1280)
  --height <num>     Viewport height (default: 800)
  --help             Show help
`);
    process.exit(0);
  } else if (!args[i].startsWith("--") && !inputSource) {
    inputSource = args[i];
  }
}

if (!inputSource) {
  if (fs.existsSync("index.html")) {
    inputSource = "index.html";
  } else {
    console.error("Error: Please specify an HTML file or URL.");
    console.error("Usage: node examples/website_to_wireframe.mjs <file.html|url> [--out wireframe]");
    process.exit(1);
  }
}

const isUrl = /^https?:\/\//i.test(inputSource);
if (!isUrl && !fs.existsSync(inputSource)) {
  console.error(`Error: Input file "${inputSource}" does not exist.`);
  process.exit(1);
}

if (!outputBaseName) {
  if (isUrl) {
    try {
      const parsedUrl = new URL(inputSource);
      outputBaseName = (parsedUrl.hostname.replace(/^www\./, "") + "-wireframe").replace(/[^\w-]/g, "_");
    } catch {
      outputBaseName = "website-wireframe";
    }
  } else {
    const parsed = path.parse(inputSource);
    outputBaseName = `${parsed.name}-wireframe`;
  }
}

console.log("=".repeat(62));
console.log(" Website to Wireframe Generator (Powered by excalidraw-tools)");
console.log("=".repeat(62));
console.log(`Target     : ${inputSource}`);
console.log(`Outputs    : ${outputBaseName}.excalidraw.md (Obsidian)`);
console.log(`             ${outputBaseName}.excalidraw    (Standard JSON)`);
console.log(`             ${outputBaseName}.tldr           (tldraw Canvas)`);
console.log(`Viewport   : ${viewportWidth}x${viewportHeight}`);

const browserExecutable = findBrowserPath();
if (!browserExecutable) {
  console.error("Error: Could not find Google Chrome or Microsoft Edge installed.");
  console.error("Please set CHROME_PATH or EDGE_PATH environment variable to your browser executable.");
  process.exit(1);
}
console.log(`Browser    : ${browserExecutable}`);

// --- Step 1: DOM Extraction via Browser Sandbox ---

async function extractDomElements(source, width, height) {
  console.log("\n[1/3] Launching browser sandbox & parsing DOM tree...");
  const browser = await puppeteer.launch({
    executablePath: browserExecutable,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const targetUrl = /^https?:\/\//i.test(source) ? source : "file:///" + path.resolve(source).replace(/\\/g, "/");

    await page.goto(targetUrl, { waitUntil: ["load", "networkidle2"], timeout: 60000 });

    const extractedData = await page.evaluate(() => {
      const items = [];
      const seenRects = new Set();

      function isVisible(el, style) {
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        return true;
      }

      function hasCardStyle(style) {
        const bg = style.backgroundColor;
        const hasBg = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
        const hasBorder = parseFloat(style.borderWidth) > 0 && style.borderStyle !== "none";
        const hasShadow = style.boxShadow && style.boxShadow !== "none";
        return hasBorder || hasShadow || (hasBg && bg !== "rgb(255, 255, 255)");
      }

      function round(val) {
        return Math.round(val * 10) / 10;
      }

      function makeRectKey(rect) {
        return `${Math.round(rect.x / 4) * 4},${Math.round(rect.y / 4) * 4},${Math.round(rect.width / 4) * 4},${Math.round(rect.height / 4) * 4}`;
      }

      const allElements = Array.from(document.querySelectorAll("*"));

      for (const el of allElements) {
        const tag = el.tagName.toLowerCase();
        if (["script", "style", "noscript", "meta", "link", "title", "head", "html", "body"].includes(tag)) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width < 6 || rect.height < 6) continue;
        if (rect.bottom < 0 || rect.right < 0) continue;

        const style = window.getComputedStyle(el);
        if (!isVisible(el, style)) continue;

        const rectKey = makeRectKey(rect);
        const isRounded = parseFloat(style.borderRadius) >= 4;

        // 1. Containers
        if (["header", "nav", "main", "footer", "section", "article", "aside", "form", "table"].includes(tag)) {
          if (!seenRects.has(rectKey)) {
            seenRects.add(rectKey);
            items.push({
              tag,
              category: "container",
              semanticType: tag,
              rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
              isRounded,
            });
          }
          continue;
        }

        // 2. Cards / Div containers
        if (["div", "li"].includes(tag) && hasCardStyle(style)) {
          if (rect.width >= 120 && rect.height >= 40 && !seenRects.has(rectKey)) {
            seenRects.add(rectKey);
            items.push({
              tag,
              category: "card",
              semanticType: "card",
              rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
              isRounded,
            });
            continue;
          }
        }

        // 3. Buttons
        if (tag === "button" || (tag === "input" && ["button", "submit", "reset"].includes(el.type))) {
          seenRects.add(rectKey);
          let label = el.value || el.innerText || el.getAttribute("aria-label") || "Button";
          label = label.trim().replace(/\s+/g, " ");
          items.push({
            tag,
            category: "button",
            label,
            rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
            isRounded: true,
          });
          continue;
        }

        // 4. Input Fields
        if (["input", "textarea", "select"].includes(tag)) {
          const type = (el.getAttribute("type") || "text").toLowerCase();
          if (["hidden", "button", "submit", "reset"].includes(type)) continue;

          seenRects.add(rectKey);
          let placeholder = el.placeholder || el.getAttribute("aria-label") || "";
          if (!placeholder && type === "email") placeholder = "email@example.com";
          if (!placeholder && type === "password") placeholder = "••••••••";
          if (!placeholder && type === "search") placeholder = "Search...";
          if (!placeholder && tag === "select") placeholder = "Select option ▼";

          items.push({
            tag,
            category: "input",
            inputType: type,
            placeholder: placeholder ? `[ ${placeholder} ]` : `[ ${type} input ]`,
            rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
            isRounded: true,
          });
          continue;
        }

        // 5. Media (Images, Icons, SVGs)
        if (["img", "svg", "canvas", "video"].includes(tag)) {
          if (el.closest("button")) continue;
          if (!seenRects.has(rectKey)) {
            seenRects.add(rectKey);
            const alt = el.getAttribute("alt") || el.getAttribute("aria-label") || (tag === "svg" ? "Icon" : "Image");
            items.push({
              tag,
              category: "media",
              label: alt,
              rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
              isRounded,
            });
          }
          continue;
        }

        // 6. Headings
        if (/^h[1-6]$/.test(tag)) {
          const text = (el.innerText || "").trim();
          if (text) {
            seenRects.add(rectKey);
            const level = parseInt(tag[1], 10);
            items.push({
              tag,
              category: "heading",
              level,
              text,
              fontSize: level === 1 ? 26 : level === 2 ? 22 : level === 3 ? 18 : 16,
              rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
            });
          }
          continue;
        }

        // 7. Text Blocks & Links
        if (["p", "a", "span", "label", "b", "strong"].includes(tag)) {
          if (el.closest("button") || el.closest("h1, h2, h3, h4, h5, h6")) continue;

          const directText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent.trim())
            .join(" ")
            .trim();

          const fullText = (el.innerText || "").trim();
          const displayText = directText || (el.children.length === 0 ? fullText : "");

          if (displayText && displayText.length > 0) {
            if (!seenRects.has(rectKey)) {
              seenRects.add(rectKey);
              const isLink = tag === "a" || Boolean(el.closest("a"));
              items.push({
                tag,
                category: "text",
                isLink,
                text: displayText,
                fontSize: parseFloat(style.fontSize) || 14,
                rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
              });
            }
          }
        }
      }

      return items;
    });

    return extractedData;
  } finally {
    await browser.close();
  }
}

// --- Step 2: Build Excalidraw Document using excalidraw-tools ---

function buildExcalidrawWireframe(elements, outBase) {
  const doc = new ExcalidrawDoc({
    theme: "light",
    viewBackgroundColor: "#ffffff",
    tags: ["wireframe", "ui"],
  });

  // Layer ordering: Containers in the back, cards next, inputs/buttons on top
  const order = { container: 1, card: 2, media: 3, input: 4, button: 5, heading: 6, text: 7 };
  const sorted = [...elements].sort((a, b) => (order[a.category] || 99) - (order[b.category] || 99));

  for (const item of sorted) {
    const { x, y, w, h } = item.rect;

    switch (item.category) {
      case "container":
        doc.addRectangle({
          x,
          y,
          width: w,
          height: h,
          strokeColor: COLORS.gray[400],
          backgroundColor: "transparent",
          strokeStyle: STROKE_STYLES.DASHED,
          strokeWidth: 1,
          roundness: item.isRounded ? { type: 3 } : null,
        });
        break;

      case "card":
        doc.addRectangle({
          x,
          y,
          width: w,
          height: h,
          strokeColor: COLORS.gray[700],
          backgroundColor: COLORS.white,
          strokeStyle: STROKE_STYLES.SOLID,
          strokeWidth: 1.5,
          roundness: item.isRounded ? { type: 3 } : null,
        });
        break;

      case "button":
        doc.addBox({
          x,
          y,
          width: w,
          height: h,
          text: item.label || "Button",
          fontSize: 14,
          backgroundColor: COLORS.gray[200],
          strokeColor: COLORS.black,
          strokeWidth: 1.5,
          roundness: { type: 3 },
        });
        break;

      case "input":
        doc.addRectangle({
          x,
          y,
          width: w,
          height: h,
          strokeColor: COLORS.gray[500],
          backgroundColor: COLORS.white,
          strokeWidth: 1,
          roundness: { type: 3 },
        });
        if (item.placeholder) {
          doc.addText({
            x: x + 8,
            y: y + Math.max(0, (h - 14) / 2),
            text: item.placeholder,
            fontSize: 12,
            strokeColor: COLORS.gray[500],
          });
        }
        break;

      case "media":
        doc.addBox({
          x,
          y,
          width: w,
          height: h,
          text: `[ ${item.label || "Image"} ]`,
          fontSize: 12,
          backgroundColor: COLORS.gray[50],
          strokeColor: COLORS.gray[400],
        });
        break;

      case "heading":
      case "text":
        doc.addText({
          x,
          y,
          text: item.text,
          fontSize: item.fontSize || (item.category === "heading" ? 22 : 14),
          strokeColor: item.isLink ? COLORS.blue.stroke : COLORS.gray[900],
        });
        break;
    }
  }

  // Save both .excalidraw and Obsidian .excalidraw.md
  const saved = doc.save(outBase, { format: "all" });
  return { doc, saved };
}

// --- Step 3: tldraw Document Generator (.tldr) ---

function convertToTldraw(elements) {
  const records = [
    {
      gridSize: 10,
      name: "",
      meta: {},
      id: "document:document",
      typeName: "document",
    },
    {
      id: "page:page",
      name: "Page 1",
      index: "a1",
      typeName: "page",
      meta: {},
    },
  ];

  const order = { container: 1, card: 2, media: 3, input: 4, button: 5, heading: 6, text: 7 };
  const sorted = [...elements].sort((a, b) => (order[a.category] || 99) - (order[b.category] || 99));

  let indexCounter = 1;

  for (const item of sorted) {
    indexCounter++;
    const rect = item.rect;
    const indexStr = `a${indexCounter.toString().padStart(4, "0")}`;
    const id = generateId();

    if (item.category === "container" || item.category === "card") {
      const isCard = item.category === "card";
      records.push({
        id: `shape:${id}`,
        typeName: "shape",
        parentId: "page:page",
        index: indexStr,
        type: "geo",
        x: rect.x,
        y: rect.y,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          w: Math.max(10, rect.w),
          h: Math.max(10, rect.h),
          geo: "rectangle",
          color: isCard ? "black" : "grey",
          labelColor: "black",
          fill: isCard ? "semi" : "none",
          dash: isCard ? "solid" : "dashed",
          size: "m",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: "",
        },
      });
    } else if (item.category === "button") {
      records.push({
        id: `shape:${id}`,
        typeName: "shape",
        parentId: "page:page",
        index: indexStr,
        type: "geo",
        x: rect.x,
        y: rect.y,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          w: Math.max(20, rect.w),
          h: Math.max(20, rect.h),
          geo: "rectangle",
          color: "blue",
          labelColor: "black",
          fill: "solid",
          dash: "draw",
          size: "m",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: item.label || "Button",
        },
      });
    } else if (item.category === "input") {
      records.push({
        id: `shape:${id}`,
        typeName: "shape",
        parentId: "page:page",
        index: indexStr,
        type: "geo",
        x: rect.x,
        y: rect.y,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          w: Math.max(20, rect.w),
          h: Math.max(20, rect.h),
          geo: "rectangle",
          color: "grey",
          labelColor: "grey",
          fill: "semi",
          dash: "draw",
          size: "s",
          font: "draw",
          align: "start",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: item.placeholder || "[ Input ]",
        },
      });
    } else if (item.category === "media") {
      records.push({
        id: `shape:${id}`,
        typeName: "shape",
        parentId: "page:page",
        index: indexStr,
        type: "geo",
        x: rect.x,
        y: rect.y,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          w: Math.max(20, rect.w),
          h: Math.max(20, rect.h),
          geo: "rectangle",
          color: "grey",
          labelColor: "black",
          fill: "pattern",
          dash: "draw",
          size: "s",
          font: "draw",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: `🖼 ${item.label || "Image"}`,
        },
      });
    } else if (item.category === "heading" || item.category === "text") {
      const isHeading = item.category === "heading";
      const size = isHeading ? (item.level <= 2 ? "l" : "m") : "s";
      const color = item.isLink ? "blue" : "black";

      records.push({
        id: `shape:${id}`,
        typeName: "shape",
        parentId: "page:page",
        index: indexStr,
        type: "text",
        x: rect.x,
        y: rect.y,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          color,
          size,
          font: "draw",
          textAlign: "start",
          w: Math.max(20, rect.w),
          text: item.text,
          scale: 1,
          autoSize: true,
        },
      });
    }
  }

  return {
    tldrawFileFormatVersion: 1,
    schema: {
      schemaVersion: 2,
      sequences: {
        "com.tldraw.store": 4,
        "com.tldraw.asset": 1,
        "com.tldraw.camera": 1,
        "com.tldraw.document": 2,
        "com.tldraw.instance": 25,
        "com.tldraw.instance_page_state": 5,
        "com.tldraw.page": 1,
        "com.tldraw.instance_presence": 6,
        "com.tldraw.pointer": 1,
        "com.tldraw.shape": 4,
        "com.tldraw.shape.text": 3,
        "com.tldraw.shape.geo": 10,
      },
    },
    records,
  };
}

// --- Main Pipeline ---

async function main() {
  try {
    const elements = await extractDomElements(inputSource, viewportWidth, viewportHeight);
    console.log(`[2/3] Extracted ${elements.length} semantic UI elements.`);

    const counts = {};
    for (const el of elements) {
      counts[el.category] = (counts[el.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(counts)) {
      console.log(`        • ${cat.padEnd(12)}: ${count}`);
    }

    console.log("\n[3/3] Generating Excalidraw & tldraw wireframes...");

    // 1. Excalidraw (Obsidian .excalidraw.md + standard .excalidraw JSON)
    const { doc, saved } = buildExcalidrawWireframe(elements, outputBaseName);
    console.log(`      ✓ Created: ${saved.mdPath} (Obsidian Excalidraw Note)`);
    console.log(`      ✓ Created: ${saved.jsonPath} (${doc.elements.length} elements)`);

    // 2. tldraw (.tldr)
    const tldrDocument = convertToTldraw(elements);
    const tldrPath = `${outputBaseName}.tldr`;
    fs.writeFileSync(tldrPath, JSON.stringify(tldrDocument, null, 2), "utf8");
    console.log(`      ✓ Created: ${tldrPath} (tldraw canvas)`);

    console.log("\n" + "=".repeat(62));
    console.log(" SUCCESS! Wireframes generated.");
    console.log("=".repeat(62));
  } catch (err) {
    console.error("\nExecution failed:", err);
    process.exit(1);
  }
}

main();
