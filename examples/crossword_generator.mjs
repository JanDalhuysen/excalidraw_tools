#!/usr/bin/env node

/**
 * Crossword Puzzle Generator for Excalidraw / Obsidian
 *
 * Generates an Excalidraw crossword puzzle complete with cell clue numbering,
 * black block tiles, across & down clues, and interactive note-taking layout.
 *
 * Usage:
 *   node examples/crossword_generator.mjs
 */

import path from "path";
import { ExcalidrawDoc, COLORS, FONTS, ROUGHNESS } from "../excalidraw.mjs";

const doc = new ExcalidrawDoc({
  roughness: ROUGHNESS.ARCHITECT,
  fontFamily: FONTS.NORMAL,
  tags: ["excalidraw", "crossword", "puzzle"],
});

// Title & Header
doc.addText({
  x: 50,
  y: 30,
  text: "✏️ The Mini Crossword",
  fontSize: 26,
  strokeColor: COLORS.black,
  fontFamily: FONTS.HAND_DRAWN,
});

doc.addText({
  x: 50,
  y: 65,
  text: "Solve the clues and write your answers in the boxes below!",
  fontSize: 14,
  strokeColor: COLORS.gray[600],
});

// 5x5 Mini Crossword Grid layout
// '#' = black block, letters = solution letter
const LAYOUT = [
  ["C", "A", "T", "#", "#"],
  ["O", "#", "A", "P", "P"],
  ["D", "O", "G", "#", "E"],
  ["E", "#", "#", "#", "N"],
  ["#", "#", "#", "#", "#"],
];

// Clues with numbers
// 1 Across: CAT (0,0)
// 3 Across: APP (1,2)
// 4 Across: DOG (2,0)
// 1 Down: CODE (0,0)
// 2 Down: TAG (0,2)
// 3 Down: PEN (1,4)
const CELL_NUMBERS = {
  "0,0": 1,
  "0,2": 2,
  "1,2": 3,
  "1,4": 4, // for down
  "2,0": 5,
};

const CLUES_ACROSS = ["1. Feline friend (3)", "3. Smartphone software download (3)", "5. Canine companion (3)"];

const CLUES_DOWN = ["1. Programmer's source text (4)", "2. HTML element or label (3)", "4. Ballpoint writing instrument (3)"];

const GRID_X = 50;
const GRID_Y = 110;
const CELL_SIZE = 55;

// Draw Grid
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 5; c++) {
    const cx = GRID_X + c * CELL_SIZE;
    const cy = GRID_Y + r * CELL_SIZE;
    const char = LAYOUT[r][c];
    const isBlack = char === "#";

    if (isBlack) {
      // Solid black cell
      doc.addRectangle({
        x: cx,
        y: cy,
        width: CELL_SIZE,
        height: CELL_SIZE,
        backgroundColor: COLORS.gray[800],
        fillStyle: "solid",
        strokeColor: COLORS.gray[800],
        strokeWidth: 1,
        roughness: 0,
        roundness: null,
      });
    } else {
      // White open cell
      doc.addRectangle({
        x: cx,
        y: cy,
        width: CELL_SIZE,
        height: CELL_SIZE,
        backgroundColor: COLORS.white,
        fillStyle: "solid",
        strokeColor: COLORS.black,
        strokeWidth: 1.5,
        roughness: 0,
        roundness: null,
      });

      // Check for cell number in top-left
      const key = `${r},${c}`;
      if (CELL_NUMBERS[key]) {
        doc.addText({
          x: cx + 4,
          y: cy + 3,
          text: String(CELL_NUMBERS[key]),
          fontSize: 11,
          strokeColor: COLORS.gray[600],
          fontFamily: FONTS.NORMAL,
        });
      }
    }
  }
}

// Draw Clues column to the right
const CLUES_X = GRID_X + 5 * CELL_SIZE + 60;
const CLUES_Y = GRID_Y;

// Across Clues
doc.addText({
  x: CLUES_X,
  y: CLUES_Y,
  text: "ACROSS",
  fontSize: 16,
  strokeColor: COLORS.black,
  fontFamily: FONTS.NORMAL,
});

CLUES_ACROSS.forEach((clue, idx) => {
  doc.addText({
    x: CLUES_X,
    y: CLUES_Y + 28 + idx * 24,
    text: clue,
    fontSize: 13,
    strokeColor: COLORS.gray[800],
    fontFamily: FONTS.HAND_DRAWN,
  });
});

// Down Clues
const DOWN_Y = CLUES_Y + 120;
doc.addText({
  x: CLUES_X,
  y: DOWN_Y,
  text: "DOWN",
  fontSize: 16,
  strokeColor: COLORS.black,
  fontFamily: FONTS.NORMAL,
});

CLUES_DOWN.forEach((clue, idx) => {
  doc.addText({
    x: CLUES_X,
    y: DOWN_Y + 28 + idx * 24,
    text: clue,
    fontSize: 13,
    strokeColor: COLORS.gray[800],
    fontFamily: FONTS.HAND_DRAWN,
  });
});

// Save outputs
const outFile = "crossword_puzzle.excalidraw.md";
const saved = doc.save(outFile, { format: "all" });

console.log(`✓ Generated Crossword puzzle!`);
console.log(`  - Obsidian Markdown : ${path.resolve(saved.mdPath)}`);
console.log(`  - Standard JSON     : ${path.resolve(saved.jsonPath)}`);
