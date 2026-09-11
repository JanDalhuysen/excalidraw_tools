#!/usr/bin/env node

/**
 * Sudoku Generator for Excalidraw / Obsidian
 *
 * Generates an interactive 9x9 Sudoku board with distinct 3x3 subgrid borders,
 * hand-drawn styled numbers, and a side-by-side solution key.
 *
 * Usage:
 *   node examples/sudoku_generator.mjs
 *   node examples/sudoku_generator.mjs --difficulty medium --out sudoku_board
 */

import path from "path";
import { ExcalidrawDoc, COLORS, FONTS, ROUGHNESS } from "../excalidraw.mjs";

// Sample valid Sudoku puzzle (0 = blank)
const SAMPLE_PUZZLE = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],

  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],

  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

const SAMPLE_SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],

  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],

  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

const doc = new ExcalidrawDoc({
  roughness: ROUGHNESS.ARTIST,
  fontFamily: FONTS.HAND_DRAWN,
  tags: ["excalidraw", "sudoku", "puzzle"],
});

// Title Header
doc.addText({
  x: 60,
  y: 30,
  text: "🔢 Daily Sudoku Challenge",
  fontSize: 26,
  strokeColor: COLORS.blue.stroke,
});

doc.addText({
  x: 60,
  y: 65,
  text: "Fill each row, column, and 3×3 box with digits from 1 to 9.",
  fontSize: 14,
  strokeColor: COLORS.gray[600],
});

function drawSudokuBoard(doc, startX, startY, gridData, cellSize = 45, isSolution = false) {
  const boardSize = cellSize * 9;

  // Background rect for the board
  doc.addRectangle({
    x: startX,
    y: startY,
    width: boardSize,
    height: boardSize,
    backgroundColor: isSolution ? COLORS.yellow.light : COLORS.white,
    strokeColor: COLORS.black,
    strokeWidth: 3,
    roughness: 0,
  });

  // Cell grid
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cx = startX + c * cellSize;
      const cy = startY + r * cellSize;

      // Cell rectangle
      doc.addRectangle({
        x: cx,
        y: cy,
        width: cellSize,
        height: cellSize,
        strokeColor: COLORS.gray[300],
        strokeWidth: 1,
        backgroundColor: "transparent",
        roughness: 0,
      });

      const val = gridData[r][c];
      if (val !== 0) {
        const isGiven = SAMPLE_PUZZLE[r][c] !== 0;
        doc.addText({
          x: cx,
          y: cy + 8,
          width: cellSize,
          height: cellSize,
          text: String(val),
          fontSize: 22,
          textAlign: "center",
          strokeColor: isGiven ? COLORS.black : COLORS.blue.stroke,
          fontFamily: isGiven ? FONTS.NORMAL : FONTS.HAND_DRAWN,
        });
      }
    }
  }

  // 3x3 Subgrid Divider Lines (thick lines)
  for (let i = 1; i <= 2; i++) {
    // Horizontal thick dividers
    doc.addLineBetween(startX, startY + i * 3 * cellSize, startX + boardSize, startY + i * 3 * cellSize, {
      strokeColor: COLORS.black,
      strokeWidth: 2.5,
      roughness: 0,
    });
    // Vertical thick dividers
    doc.addLineBetween(startX + i * 3 * cellSize, startY, startX + i * 3 * cellSize, startY + boardSize, {
      strokeColor: COLORS.black,
      strokeWidth: 2.5,
      roughness: 0,
    });
  }
}

// 1. Draw Main Puzzle
const PUZZLE_X = 60;
const PUZZLE_Y = 110;
const CELL = 45;

doc.addText({
  x: PUZZLE_X,
  y: PUZZLE_Y - 25,
  text: "Puzzle (Difficulty: Medium)",
  fontSize: 16,
  strokeColor: COLORS.gray[800],
});
drawSudokuBoard(doc, PUZZLE_X, PUZZLE_Y, SAMPLE_PUZZLE, CELL, false);

// 2. Draw Solution (Smaller, side by side or below)
const SOL_X = PUZZLE_X + CELL * 9 + 80;
const SOL_Y = PUZZLE_Y;
const SOL_CELL = 35;

doc.addText({
  x: SOL_X,
  y: SOL_Y - 25,
  text: "💡 Answer Key / Solution",
  fontSize: 16,
  strokeColor: COLORS.gray[800],
});
drawSudokuBoard(doc, SOL_X, SOL_Y, SAMPLE_SOLUTION, SOL_CELL, true);

// Save output
const outFile = "sudoku_puzzle.excalidraw.md";
const saved = doc.save(outFile, { format: "all" });

console.log(`✓ Generated Sudoku puzzle!`);
console.log(`  - Obsidian Markdown : ${path.resolve(saved.mdPath)}`);
console.log(`  - Standard JSON     : ${path.resolve(saved.jsonPath)}`);
