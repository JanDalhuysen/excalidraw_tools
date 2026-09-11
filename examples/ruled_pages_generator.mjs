#!/usr/bin/env node

/**
 * Ruled A4 Pages Generator for Excalidraw / Obsidian
 *
 * Recreates and enhances `gen_ob_ex_md.js` using the `excalidraw-tools` toolkit.
 * Generates printable/note-taking A4 pages with crisp borders, corner dots,
 * and notebook-style horizontal ruled lines.
 *
 * Usage:
 *   node examples/ruled_pages_generator.mjs
 *   node examples/ruled_pages_generator.mjs --pages 5 --layout vertical --out notebook
 *   node examples/ruled_pages_generator.mjs --pages 2 --layout horizontal --line-spacing 100
 */

import path from "path";
import { ExcalidrawDoc, ROUGHNESS, FONTS } from "../excalidraw.mjs";

// --- CLI Parsing ---
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

// Paper sizes in units of 0.1 mm (e.g. 210mm x 297mm = 2100 x 2970)
const PAPER_SIZES = {
  a4: { width: 2100, height: 2970 },
  letter: { width: 2159, height: 2794 },
};

const paperType = getArg("--paper", "a4").toLowerCase();
const paper = PAPER_SIZES[paperType] || PAPER_SIZES.a4;

const CONFIG = {
  numPages: parseInt(getArg("--pages", 3), 10),
  layout: getArg("--layout", "vertical").toLowerCase().startsWith("h") ? "horizontal" : "vertical",
  spacing: parseInt(getArg("--spacing", 100), 10),
  addRuledLines: !hasFlag("--no-ruled"),
  lineSpacing: parseInt(getArg("--line-spacing", 80), 10), // 80px (~8mm spacing)
  pageWidth: paper.width,
  pageHeight: paper.height,
  ruledMargin: parseInt(getArg("--margin", 150), 10), // 15mm
  ruledTopMargin: parseInt(getArg("--top-margin", 200), 10), // 20mm
  ruledBottomMargin: parseInt(getArg("--bottom-margin", 200), 10), // 20mm
  lineColor: getArg("--line-color", "#90D5FF"), // Notebook light blue
  borderColor: getArg("--border-color", "#1e1e1e"),
  outputBase: getArg("--out", "ruled_pages"),
};

console.log("=".repeat(60));
console.log(" A4 Ruled Pages Generator (Powered by excalidraw-tools)");
console.log("=".repeat(60));
console.log(`Pages       : ${CONFIG.numPages} (${paperType.toUpperCase()} - ${CONFIG.pageWidth} x ${CONFIG.pageHeight})`);
console.log(`Layout      : ${CONFIG.layout}`);
console.log(`Ruled Lines : ${CONFIG.addRuledLines ? `Yes (every ${CONFIG.lineSpacing}px)` : "No"}`);
console.log(`Output      : ${CONFIG.outputBase}.excalidraw.md`);

// --- Excalidraw Document Initialization ---
const doc = new ExcalidrawDoc({
  theme: "light",
  viewBackgroundColor: "#ffffff",
  fontFamily: FONTS.HAND_DRAWN,
  roughness: ROUGHNESS.ARCHITECT, // 0 = crisp lines for notebook stationery
  tags: ["excalidraw", "stationery", "notebook", "ruled-pages"],
  gridSize: 20,
  appState: {
    gridStep: 5,
    gridModeEnabled: true,
    gridColor: {
      Bold: "rgba(217, 217, 217, 0.5)",
      Regular: "rgba(230, 230, 230, 0.5)",
    },
    frameRendering: {
      enabled: true,
      clip: true,
      name: true,
      outline: true,
      markerName: true,
      markerEnabled: true,
    },
    objectsSnapModeEnabled: false,
    isMidpointSnappingEnabled: true,
    boxSelectionMode: "contain",
  },
});

let totalLinesDrawn = 0;

for (let i = 0; i < CONFIG.numPages; i++) {
  let offsetX = 0;
  let offsetY = 0;

  if (CONFIG.layout === "horizontal") {
    offsetX = i * (CONFIG.pageWidth + CONFIG.spacing);
  } else {
    offsetY = i * (CONFIG.pageHeight + CONFIG.spacing);
  }

  // 1. Four Corner Alignment Dots
  doc.addDot(offsetX, offsetY, { color: CONFIG.borderColor, size: 2 });
  doc.addDot(offsetX + CONFIG.pageWidth, offsetY, { color: CONFIG.borderColor, size: 2 });
  doc.addDot(offsetX, offsetY + CONFIG.pageHeight, { color: CONFIG.borderColor, size: 2 });
  doc.addDot(offsetX + CONFIG.pageWidth, offsetY + CONFIG.pageHeight, { color: CONFIG.borderColor, size: 2 });

  // 2. Crisp Page Outer Borders (Top, Left, Right, Bottom)
  const borderOpts = {
    strokeColor: CONFIG.borderColor,
    strokeWidth: 1,
    roughness: 0,
  };

  // Top
  doc.addLineBetween(offsetX, offsetY, offsetX + CONFIG.pageWidth, offsetY, borderOpts);
  // Left
  doc.addLineBetween(offsetX, offsetY, offsetX, offsetY + CONFIG.pageHeight, borderOpts);
  // Right
  doc.addLineBetween(offsetX + CONFIG.pageWidth, offsetY, offsetX + CONFIG.pageWidth, offsetY + CONFIG.pageHeight, borderOpts);
  // Bottom
  doc.addLineBetween(offsetX, offsetY + CONFIG.pageHeight, offsetX + CONFIG.pageWidth, offsetY + CONFIG.pageHeight, borderOpts);

  // 3. Ruled Lines (if enabled)
  if (CONFIG.addRuledLines) {
    const lineYStart = offsetY + CONFIG.ruledTopMargin;
    const lineX = offsetX + CONFIG.ruledMargin;
    const lineW = CONFIG.pageWidth - 2 * CONFIG.ruledMargin;
    const availableHeight = CONFIG.pageHeight - CONFIG.ruledTopMargin - CONFIG.ruledBottomMargin;
    const numLines = Math.floor(availableHeight / CONFIG.lineSpacing);

    for (let j = 0; j < numLines; j++) {
      const y = lineYStart + j * CONFIG.lineSpacing;
      doc.addLineBetween(lineX, y, lineX + lineW, y, {
        strokeColor: CONFIG.lineColor,
        strokeWidth: 1,
        roughness: 0,
      });
      totalLinesDrawn++;
    }
  }
}

// Save outputs (.excalidraw and .excalidraw.md)
const saved = doc.save(CONFIG.outputBase, { format: "all" });

console.log("\n" + "=".repeat(60));
console.log(" SUCCESS! Generated ruled notebook pages:");
console.log(`  ✓ Obsidian Markdown : ${path.resolve(saved.mdPath)}`);
console.log(`  ✓ Excalidraw JSON   : ${path.resolve(saved.jsonPath)}`);
console.log(`  Total Elements      : ${doc.elements.length} (${totalLinesDrawn} ruled lines)`);
console.log("=".repeat(60));
