# Excalidraw Tools (`excalidraw-tools`)

A lightweight, zero-dependency Node.js toolkit for programmatically generating **Excalidraw drawings** and **Obsidian Excalidraw Markdown notes** (`.excalidraw.md`).

Designed for building fun visual generators: **Mazes**, **Sudokus**, **Crosswords**, **Flowcharts**, **Mind maps**, **Family trees**, and **Wireframes** without having to rewrite boilerplate JSON or markdown wrappers every time.

---

## Features

- **Dual Module Support**: Works with ES Modules (`import`) and CommonJS (`require`).
- **Obsidian Native**: Generates `.excalidraw.md` with the exact frontmatter and JSON block expected by the Obsidian Excalidraw plugin.
- **Complete Element Factory**: Rectangles, ellipses, diamonds, lines, arrows, auto-centered text boxes, dots, and frames.
- **Smart Connectors**: `addConnectArrow(elementA, elementB)` with automatic binding anchors.
- **Grid Helper**: Built-in `addGrid()` for matrix games (Sudoku, Crossword, Maze, Game of Life).
- **Styling Constants**: Palettes, font styles (`Virgil`, `Helvetica`, `Cascadia`), roughness presets (`Architect`, `Artist`, `Cartoonist`), and stroke styles.
- **Two-way Loader**: `ExcalidrawDoc.load('my_note.excalidraw.md')` reads and parses existing diagrams back into editable objects.

---

## Quick Start (5 lines)

```javascript
import { ExcalidrawDoc, COLORS } from "./excalidraw.mjs";

const doc = new ExcalidrawDoc({ theme: "light" });
doc.addText({ x: 50, y: 30, text: "Hello Obsidian & Excalidraw!", fontSize: 24 });
doc.addBox({ x: 50, y: 80, text: "Click Me", backgroundColor: COLORS.blue.light });

// Saves both "my_diagram.excalidraw" AND "my_diagram.excalidraw.md"
doc.save("my_diagram", { format: "all" });
```

---

## Included Examples

Three ready-to-run generator scripts are included in `examples/`:

### 1. Maze Generator (`examples/maze_generator.mjs`)

Generates a randomized labyrinth using recursive backtracking with custom rows, columns, and cell sizes.

```bash
node examples/maze_generator.mjs --rows 12 --cols 16 --cell 40
```

Outputs `maze_puzzle.excalidraw.md` and `maze_puzzle.excalidraw`.

### 2. Sudoku Generator (`examples/sudoku_generator.mjs`)

Builds a 9x9 board with thick 3x3 subgrid divider lines, pre-filled digits, and an optional answer key.

```bash
node examples/sudoku_generator.mjs
```

Outputs `sudoku_puzzle.excalidraw.md` and `sudoku_puzzle.excalidraw`.

### 3. Crossword Generator (`examples/crossword_generator.mjs`)

Builds a crossword puzzle grid with cell numbers in the top-left corner, black blocker cells, and across/down clue lists.

```bash
node examples/crossword_generator.mjs
```

Outputs `crossword_puzzle.excalidraw.md` and `crossword_puzzle.excalidraw`.

### 4. Ruled A4 Pages Generator (`examples/ruled_pages_generator.mjs`)

Recreates and enhances `gen_ob_ex_md.js`. Generates printable A4 notebook stationery with 4-corner alignment dots, crisp outer borders, and customizable ruled lines.

```bash
node examples/ruled_pages_generator.mjs --pages 3 --layout vertical --line-spacing 80
```

Outputs `ruled_pages.excalidraw.md` and `ruled_pages.excalidraw`.

### 5. Website to Wireframe Generator (`examples/website_to_wireframe.mjs`)

Extracts bounding boxes and semantic layout elements (cards, buttons, inputs, images, headings) from any local HTML page or live URL, and converts them into editable Excalidraw and tldraw wireframes.

```bash
node examples/website_to_wireframe.mjs index.html --out my_wireframe
# or from a live site:
node examples/website_to_wireframe.mjs https://example.com --out example_wireframe
```

Outputs `my_wireframe.excalidraw.md`, `my_wireframe.excalidraw`, and `my_wireframe.tldr`.

---

## API Reference

### 1. Initializing a Document

```javascript
import { ExcalidrawDoc, FONTS, ROUGHNESS } from "./excalidraw.mjs";

const doc = new ExcalidrawDoc({
  theme: "light", // 'light' or 'dark'
  viewBackgroundColor: "#ffffff",
  fontFamily: FONTS.HAND_DRAWN, // FONTS.HAND_DRAWN (1), FONTS.NORMAL (2), FONTS.CODE (3)
  roughness: ROUGHNESS.ARTIST, // ROUGHNESS.ARCHITECT (0), ARTIST (1), CARTOONIST (2)
  tags: ["excalidraw", "puzzle"],
});
```

### 2. Adding Elements

#### Text

```javascript
doc.addText({
  x: 100,
  y: 100,
  text: "Title Here",
  fontSize: 20,
  textAlign: "center", // 'left' | 'center' | 'right'
  strokeColor: "#1e1e1e",
});
```

#### Shapes (Rectangle, Ellipse, Diamond)

```javascript
// Rectangle
doc.addRectangle({
  x: 50,
  y: 150,
  width: 120,
  height: 60,
  backgroundColor: "#a5d8ff",
  fillStyle: "solid", // 'solid' | 'hachure' | 'cross-hatch' | 'dots'
  roundness: { type: 3 }, // rounded corners
});

// Circle / Ellipse
doc.addEllipse({
  x: 200,
  y: 150,
  width: 80,
  height: 80,
  backgroundColor: "#b2f2bb",
});

// Diamond (Flowcharts / Decision nodes)
doc.addDiamond({
  x: 320,
  y: 150,
  width: 90,
  height: 90,
  backgroundColor: "#ffe066",
});
```

#### Compound Box (Auto-sized card with centered text)

```javascript
const box = doc.addBox({
  x: 50,
  y: 250,
  text: "Automatic Centered Card",
  fontSize: 14,
  backgroundColor: "#f3f0ff",
  strokeColor: "#7048e8",
});
```

#### Lines & Arrows

```javascript
// Straight line between two points
doc.addLineBetween(50, 400, 250, 400, {
  strokeColor: "#adb5bd",
  strokeWidth: 2,
  strokeStyle: "dashed", // 'solid' | 'dashed' | 'dotted'
});

// Arrow between points
doc.addArrow(50, 420, 250, 420, { strokeColor: "#e03131" });

// Connecting two shapes automatically
const boxA = doc.addRectangle({ x: 50, y: 500, width: 100, height: 50 });
const boxB = doc.addRectangle({ x: 250, y: 500, width: 100, height: 50 });
doc.addConnectArrow(boxA, boxB, { strokeColor: "#1971c2" });
```

#### Grid (Sudoku / Crosswords / Mazes)

```javascript
const grid = doc.addGrid({
  x: 50,
  y: 600,
  rows: 9,
  cols: 9,
  cellSize: 40,
  strokeColor: "#ced4da",
  renderMode: "rectangles", // 'rectangles' (for individual cells) or 'lines'
});

// Access cell coordinates
const cell = grid.getCell(0, 0); // { x, y, width, height, centerX, centerY, rect }
```

### 3. Saving & Exporting

```javascript
// 1. Save both Obsidian Markdown and standard JSON
doc.save("notes/my_puzzle", { format: "all" });

// 2. Save only Obsidian Excalidraw Markdown (.excalidraw.md)
doc.save("notes/my_puzzle.excalidraw.md");

// 3. Save only standard Excalidraw JSON (.excalidraw)
doc.save("notes/my_puzzle.excalidraw");

// 4. Get strings in memory
const mdString = doc.toObsidianMarkdown({ tags: ["games"] });
const jsonString = doc.toJSON();
```

### 4. Reading / Loading Existing Diagrams

```javascript
// Reads either .excalidraw or .excalidraw.md
const doc = ExcalidrawDoc.load("my_drawing.excalidraw.md");
console.log(`Loaded ${doc.elements.length} elements`);

// Modify and re-save
doc.addText({ x: 0, y: 0, text: "Appended note!" });
doc.save("my_drawing.excalidraw.md");
```

---

## Constants Reference

- **`FONTS`**: `HAND_DRAWN` (1), `NORMAL` (2), `CODE` (3), `EXCALIFONT` (5)
- **`ROUGHNESS`**: `ARCHITECT` (0), `ARTIST` (1), `CARTOONIST` (2)
- **`STROKE_STYLES`**: `SOLID`, `DASHED`, `DOTTED`
- **`FILL_STYLES`**: `TRANSPARENT`, `SOLID`, `HACHURE`, `CROSS_HATCH`, `DOTS`
- **`COLORS`**: Pre-configured palette with light backgrounds, strokes, and gray scales (`COLORS.blue`, `COLORS.green`, `COLORS.yellow`, `COLORS.red`, `COLORS.purple`, `COLORS.gray`).

---

## Screenshot & Web Extraction Utilities (`tools/`)

This repository also includes high-DPI screenshotting and HTML extraction utilities powered by headless Chrome / Edge (`puppeteer-core`).

### 1. High-Resolution Screenshotter (`tools/capture_screenshot.mjs`)

Captures ultra-sharp PNG screenshots from SVG files, HTML files, or live URLs with automatic font loading and Retina-level scaling (`--scale 4` by default):

```bash
# Capture an SVG diagram to PNG
node tools/capture_screenshot.mjs diagram.svg --scale 4 --out diagram.png

# Capture a specific element from a website
node tools/capture_screenshot.mjs https://en.wikipedia.org/wiki/Fortune_Global_500 --selector "table.wikitable" --out table.png
```

### 2. HTML Tag Extractor & Screenshotter (`tools/extract_and_screenshot.mjs`)

Scrapes all occurrences of a tag (e.g. `table`), preserves layout/CSS, fixes images/flags, and exports both standalone HTML files and high-res PNGs:

```bash
# Extract the first 3 tables from Wikipedia with full typography and flags
node tools/extract_and_screenshot.mjs https://en.wikipedia.org/wiki/Fortune_Global_500 --tag table --limit 3 --out ./extracted_tables
```
