#!/usr/bin/env node

/**
 * Maze Generator for Excalidraw / Obsidian
 *
 * Generates a randomized maze using depth-first search (recursive backtracking)
 * and exports it directly as an Obsidian Excalidraw Markdown file (.excalidraw.md).
 *
 * Usage:
 *   node examples/maze_generator.mjs
 *   node examples/maze_generator.mjs --rows 15 --cols 20 --cell 40 --out my_maze
 */

import path from "path";
import { ExcalidrawDoc, COLORS, FONTS, ROUGHNESS } from "../excalidraw.mjs";

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const ROWS = parseInt(getArg("--rows", 12), 10);
const COLS = parseInt(getArg("--cols", 16), 10);
const CELL_SIZE = parseInt(getArg("--cell", 40), 10);
const OUT_FILE = getArg("--out", "maze_puzzle.excalidraw.md");

console.log(`Generating ${COLS}x${ROWS} Maze (cell size: ${CELL_SIZE}px)...`);

// 1. Maze generation with Depth-First Search (Recursive Backtracker)
// Grid cells: top, right, bottom, left walls
const grid = Array.from({ length: ROWS }, () =>
  Array.from({ length: COLS }, () => ({
    visited: false,
    walls: { top: true, right: true, bottom: true, left: true },
  })),
);

function carvePassages(r, c) {
  grid[r][c].visited = true;

  const directions = [
    { dr: -1, dc: 0, wall: "top", opp: "bottom" },
    { dr: 1, dc: 0, wall: "bottom", opp: "top" },
    { dr: 0, dc: -1, wall: "left", opp: "right" },
    { dr: 0, dc: 1, wall: "right", opp: "left" },
  ];

  // Randomize direction order
  directions.sort(() => Math.random() - 0.5);

  for (const { dr, dc, wall, opp } of directions) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !grid[nr][nc].visited) {
      grid[r][c].walls[wall] = false;
      grid[nr][nc].walls[opp] = false;
      carvePassages(nr, nc);
    }
  }
}

// Start from top-left
carvePassages(0, 0);

// Open entrance (top-left) and exit (bottom-right)
grid[0][0].walls.left = false;
grid[ROWS - 1][COLS - 1].walls.right = false;

// 2. Build Excalidraw Canvas
const doc = new ExcalidrawDoc({
  roughness: ROUGHNESS.ARTIST,
  fontFamily: FONTS.HAND_DRAWN,
  tags: ["excalidraw", "maze", "game"],
});

const startX = 60;
const startY = 100;

// Title & Instructions
doc.addText({
  x: startX,
  y: 30,
  text: "🧩 The Labyrinth: Can you reach the exit?",
  fontSize: 24,
  strokeColor: COLORS.purple.stroke,
});

doc.addText({
  x: startX,
  y: 65,
  text: `Start at Green (Top-Left) ➔ Navigate to Red (Bottom-Right)  •  ${COLS} x ${ROWS} Grid`,
  fontSize: 14,
  strokeColor: COLORS.gray[600],
});

// Start & Finish Highlights
doc.addRectangle({
  x: startX,
  y: startY,
  width: CELL_SIZE,
  height: CELL_SIZE,
  backgroundColor: COLORS.green.fill,
  fillStyle: "solid",
  strokeColor: "transparent",
  opacity: 70,
});

doc.addText({
  x: startX - 50,
  y: startY + CELL_SIZE / 4,
  text: "START ▶",
  fontSize: 14,
  strokeColor: COLORS.green.stroke,
});

doc.addRectangle({
  x: startX + (COLS - 1) * CELL_SIZE,
  y: startY + (ROWS - 1) * CELL_SIZE,
  width: CELL_SIZE,
  height: CELL_SIZE,
  backgroundColor: COLORS.red.fill,
  fillStyle: "solid",
  strokeColor: "transparent",
  opacity: 70,
});

doc.addText({
  x: startX + COLS * CELL_SIZE + 10,
  y: startY + (ROWS - 1) * CELL_SIZE + CELL_SIZE / 4,
  text: "▶ EXIT",
  fontSize: 14,
  strokeColor: COLORS.red.stroke,
});

// Draw walls
const wallOpts = {
  strokeColor: COLORS.black,
  strokeWidth: 2,
  roughness: 1,
};

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const cx = startX + c * CELL_SIZE;
    const cy = startY + r * CELL_SIZE;
    const { top, right, bottom, left } = grid[r][c].walls;

    if (top) {
      doc.addLineBetween(cx, cy, cx + CELL_SIZE, cy, wallOpts);
    }
    if (left) {
      doc.addLineBetween(cx, cy, cx, cy + CELL_SIZE, wallOpts);
    }
    // Only bottom-most row needs explicit bottom wall
    if (r === ROWS - 1 && bottom) {
      doc.addLineBetween(cx, cy + CELL_SIZE, cx + CELL_SIZE, cy + CELL_SIZE, wallOpts);
    }
    // Only right-most column needs explicit right wall
    if (c === COLS - 1 && right) {
      doc.addLineBetween(cx + CELL_SIZE, cy, cx + CELL_SIZE, cy + CELL_SIZE, wallOpts);
    }
  }
}

// Save directly to disk
const saved = doc.save(OUT_FILE, { format: "all" });
console.log(`✓ Generated Maze!`);
console.log(`  - Obsidian Markdown : ${path.resolve(saved.mdPath)}`);
console.log(`  - Standard JSON     : ${path.resolve(saved.jsonPath)}`);
