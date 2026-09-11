import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Standard Excalidraw font families
 */
export const FONTS = Object.freeze({
  HAND_DRAWN: 1, // Virgil
  NORMAL: 2, // Helvetica
  CODE: 3, // Cascadia / Monospace
  EXCALIFONT: 5, // Excalifont
});

/**
 * Standard roughness levels
 */
export const ROUGHNESS = Object.freeze({
  ARCHITECT: 0, // Clean, crisp lines
  ARTIST: 1, // Normal hand-drawn style
  CARTOONIST: 2, // Messy / sketched style
});

/**
 * Stroke styles
 */
export const STROKE_STYLES = Object.freeze({
  SOLID: "solid",
  DASHED: "dashed",
  DOTTED: "dotted",
});

/**
 * Fill styles
 */
export const FILL_STYLES = Object.freeze({
  TRANSPARENT: "transparent",
  SOLID: "solid",
  HACHURE: "hachure",
  CROSS_HATCH: "cross-hatch",
  DOTS: "dots",
});

/**
 * Common Color Palettes
 */
export const COLORS = Object.freeze({
  black: "#1e1e1e",
  white: "#ffffff",
  transparent: "transparent",
  gray: {
    50: "#f8f9fa",
    100: "#f1f3f5",
    200: "#e9ecef",
    300: "#dee2e6",
    400: "#ced4da",
    500: "#adb5bd",
    600: "#868e96",
    700: "#495057",
    800: "#343a40",
    900: "#212529",
  },
  blue: {
    light: "#e7f5ff",
    stroke: "#1971c2",
    fill: "#a5d8ff",
  },
  green: {
    light: "#ebfbee",
    stroke: "#2f9e44",
    fill: "#b2f2bb",
  },
  yellow: {
    light: "#fff9db",
    stroke: "#f08c00",
    fill: "#ffe066",
  },
  red: {
    light: "#fff5f5",
    stroke: "#e03131",
    fill: "#ffc9c9",
  },
  purple: {
    light: "#f3f0ff",
    stroke: "#7048e8",
    fill: "#d0bfff",
  },
  cyan: {
    light: "#e3fafc",
    stroke: "#0c8599",
    fill: "#99e9f2",
  },
  pink: {
    light: "#fff0f6",
    stroke: "#d6336c",
    fill: "#fcc2d7",
  },
  orange: {
    light: "#fff4e6",
    stroke: "#d9480f",
    fill: "#ffc078",
  },
});

/**
 * Generate unique 20-character Excalidraw element ID
 */
export function generateId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = "";
  if (crypto && crypto.randomBytes) {
    const bytes = crypto.randomBytes(20);
    for (let i = 0; i < 20; i++) {
      id += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 20; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return id;
}

/**
 * Approximate text width and height for Excalidraw text elements
 */
export function estimateTextDimensions(text, fontSize = 16, fontFamily = FONTS.HAND_DRAWN) {
  const lines = String(text ?? "").split("\n");
  const maxLineLength = Math.max(0, ...lines.map((l) => l.length));

  let widthFactor = 0.58;
  if (fontFamily === FONTS.CODE) widthFactor = 0.62;
  else if (fontFamily === FONTS.NORMAL) widthFactor = 0.54;

  const width = Math.max(10, Math.round(maxLineLength * fontSize * widthFactor));
  const height = Math.max(10, Math.round(lines.length * fontSize * 1.3));
  return { width, height, linesCount: lines.length };
}

/**
 * Base element structure conforming to Excalidraw schema
 */
export function createBaseElement(type, x, y, width, height, extra = {}) {
  return {
    id: extra.id || generateId(),
    type,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(0.0001, Math.round(width)),
    height: Math.max(0.0001, Math.round(height)),
    angle: 0,
    strokeColor: extra.strokeColor ?? "#1e1e1e",
    backgroundColor: extra.backgroundColor ?? "transparent",
    fillStyle: extra.fillStyle ?? "solid",
    strokeWidth: extra.strokeWidth ?? 1,
    strokeStyle: extra.strokeStyle ?? "solid",
    roughness: extra.roughness ?? 1,
    opacity: extra.opacity ?? 100,
    groupIds: extra.groupIds ? [...extra.groupIds] : [],
    frameId: extra.frameId ?? null,
    index: extra.index ?? "a0001",
    roundness: extra.roundness !== undefined ? extra.roundness : null,
    seed: extra.seed ?? Math.floor(Math.random() * 2147483647),
    version: extra.version ?? 1,
    versionNonce: extra.versionNonce ?? Math.floor(Math.random() * 2147483647),
    isDeleted: false,
    boundElements: extra.boundElements ? [...extra.boundElements] : [],
    updated: extra.updated ?? Date.now(),
    link: extra.link ?? null,
    locked: extra.locked ?? false,
    ...extra,
  };
}

/**
 * The main Excalidraw Document builder
 */
export class ExcalidrawDoc {
  constructor(options = {}) {
    this.theme = options.theme || "light";
    this.viewBackgroundColor = options.viewBackgroundColor || (this.theme === "dark" ? "#121826" : "#ffffff");
    this.fontFamily = options.fontFamily || FONTS.HAND_DRAWN;
    this.roughness = options.roughness !== undefined ? options.roughness : ROUGHNESS.ARTIST;
    this.strokeColor = options.strokeColor || (this.theme === "dark" ? "#f8fafc" : "#1e1e1e");
    this.gridSize = options.gridSize || 20;
    this.zoom = options.zoom || 1;
    this.tags = options.tags || ["excalidraw"];
    this.appState = options.appState || {};

    this.elements = [];
    this.elementIndex = 0;
  }

  /**
   * Generates a fractional order index string for Excalidraw elements
   */
  nextIndex() {
    this.elementIndex++;
    return `a${String(this.elementIndex).padStart(5, "0")}`;
  }

  /**
   * Add a generic element
   */
  addElement(element) {
    if (!element.id) element.id = generateId();
    if (!element.index) element.index = this.nextIndex();
    this.elements.push(element);
    return element;
  }

  /**
   * Add a Rectangle
   */
  addRectangle({
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    strokeColor = this.strokeColor,
    backgroundColor = "transparent",
    fillStyle = "solid",
    strokeWidth = 1,
    strokeStyle = "solid",
    roughness = this.roughness,
    roundness = { type: 3 }, // type 3 = rounded corner
    opacity = 100,
    groupIds = [],
    link = null,
    locked = false,
    ...extra
  } = {}) {
    const el = createBaseElement("rectangle", x, y, width, height, {
      index: this.nextIndex(),
      strokeColor,
      backgroundColor,
      fillStyle,
      strokeWidth,
      strokeStyle,
      roughness,
      roundness,
      opacity,
      groupIds,
      link,
      locked,
      ...extra,
    });
    this.elements.push(el);
    return el;
  }

  /**
   * Add an Ellipse / Circle
   */
  addEllipse({
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    strokeColor = this.strokeColor,
    backgroundColor = "transparent",
    fillStyle = "solid",
    strokeWidth = 1,
    strokeStyle = "solid",
    roughness = this.roughness,
    opacity = 100,
    groupIds = [],
    link = null,
    locked = false,
    ...extra
  } = {}) {
    const el = createBaseElement("ellipse", x, y, width, height, {
      index: this.nextIndex(),
      strokeColor,
      backgroundColor,
      fillStyle,
      strokeWidth,
      strokeStyle,
      roughness,
      opacity,
      groupIds,
      link,
      locked,
      ...extra,
    });
    this.elements.push(el);
    return el;
  }

  /**
   * Add a Diamond
   */
  addDiamond({
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    strokeColor = this.strokeColor,
    backgroundColor = "transparent",
    fillStyle = "solid",
    strokeWidth = 1,
    strokeStyle = "solid",
    roughness = this.roughness,
    opacity = 100,
    groupIds = [],
    link = null,
    locked = false,
    ...extra
  } = {}) {
    const el = createBaseElement("diamond", x, y, width, height, {
      index: this.nextIndex(),
      strokeColor,
      backgroundColor,
      fillStyle,
      strokeWidth,
      strokeStyle,
      roughness,
      opacity,
      groupIds,
      link,
      locked,
      ...extra,
    });
    this.elements.push(el);
    return el;
  }

  /**
   * Add a Text element
   */
  addText({
    x = 0,
    y = 0,
    text = "",
    fontSize = 16,
    fontFamily = this.fontFamily,
    textAlign = "left",
    verticalAlign = "top",
    strokeColor = this.strokeColor,
    containerId = null,
    width = null,
    height = null,
    lineHeight = 1.3,
    roughness = 0,
    groupIds = [],
    link = null,
    locked = false,
    ...extra
  } = {}) {
    const textStr = String(text ?? "");
    const estimated = estimateTextDimensions(textStr, fontSize, fontFamily);
    const finalWidth = width !== null ? width : estimated.width;
    const finalHeight = height !== null ? height : estimated.height;

    const el = createBaseElement("text", x, y, finalWidth, finalHeight, {
      index: this.nextIndex(),
      strokeColor,
      backgroundColor: "transparent",
      roughness,
      groupIds,
      link,
      locked,
      text: textStr,
      originalText: textStr,
      fontSize,
      fontFamily,
      textAlign,
      verticalAlign,
      containerId,
      lineHeight,
      baseline: Math.round(fontSize * 0.8),
      ...extra,
    });
    this.elements.push(el);
    return el;
  }

  /**
   * Add a compound Box with bound, auto-centered (or aligned) text
   */
  addBox({
    x = 0,
    y = 0,
    width = null,
    height = null,
    text = "",
    fontSize = 16,
    fontFamily = this.fontFamily,
    textAlign = "center",
    verticalAlign = "middle",
    paddingX = 16,
    paddingY = 12,
    strokeColor = this.strokeColor,
    textColor = this.strokeColor,
    backgroundColor = "transparent",
    fillStyle = "solid",
    strokeWidth = 1,
    strokeStyle = "solid",
    roughness = this.roughness,
    roundness = { type: 3 },
    groupIds = [],
    link = null,
    locked = false,
  } = {}) {
    const est = estimateTextDimensions(text, fontSize, fontFamily);
    const boxW = width !== null ? width : est.width + paddingX * 2;
    const boxH = height !== null ? height : est.height + paddingY * 2;

    const rect = this.addRectangle({
      x,
      y,
      width: boxW,
      height: boxH,
      strokeColor,
      backgroundColor,
      fillStyle,
      strokeWidth,
      strokeStyle,
      roughness,
      roundness,
      groupIds,
      link,
      locked,
    });

    const labelX = x;
    const labelY = y + (boxH - est.height) / 2;

    const label = this.addText({
      x: labelX,
      y: labelY,
      width: boxW,
      height: est.height,
      text,
      fontSize,
      fontFamily,
      textAlign,
      verticalAlign,
      strokeColor: textColor,
      containerId: rect.id,
      groupIds,
    });

    rect.boundElements = rect.boundElements || [];
    rect.boundElements.push({ id: label.id, type: "text" });

    return { rect, label, id: rect.id, width: boxW, height: boxH };
  }

  /**
   * Add a Line or Multi-segment Polyline
   */
  addLine({
    x = 0,
    y = 0,
    points = [
      [0, 0],
      [100, 0],
    ],
    strokeColor = this.strokeColor,
    strokeWidth = 1,
    strokeStyle = "solid",
    roughness = this.roughness,
    roundness = { type: 2 },
    startArrowhead = null,
    endArrowhead = null,
    startBinding = null,
    endBinding = null,
    groupIds = [],
    link = null,
    locked = false,
    ...extra
  } = {}) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const type = startArrowhead || endArrowhead ? "arrow" : "line";

    const el = createBaseElement(type, x, y, Math.max(1, maxX - minX), Math.max(1, maxY - minY), {
      index: this.nextIndex(),
      strokeColor,
      strokeWidth,
      strokeStyle,
      roughness,
      roundness,
      points: points.map(([px, py]) => [Math.round(px), Math.round(py)]),
      startArrowhead,
      endArrowhead,
      startBinding,
      endBinding,
      groupIds,
      link,
      locked,
      ...extra,
    });

    this.elements.push(el);
    return el;
  }

  /**
   * Add a Line connecting two coordinates (x1, y1) to (x2, y2)
   */
  addLineBetween(x1, y1, x2, y2, options = {}) {
    return this.addLine({
      x: x1,
      y: y1,
      points: [
        [0, 0],
        [x2 - x1, y2 - y1],
      ],
      ...options,
    });
  }

  /**
   * Add an Arrow connecting two coordinates (x1, y1) to (x2, y2)
   */
  addArrow(x1, y1, x2, y2, options = {}) {
    return this.addLine({
      x: x1,
      y: y1,
      points: [
        [0, 0],
        [x2 - x1, y2 - y1],
      ],
      endArrowhead: "arrow",
      ...options,
    });
  }

  /**
   * Add an Arrow connecting two elements with automatic bindings
   */
  addConnectArrow(fromEl, toEl, options = {}) {
    const fromCenter = {
      x: fromEl.x + fromEl.width / 2,
      y: fromEl.y + fromEl.height / 2,
    };
    const toCenter = {
      x: toEl.x + toEl.width / 2,
      y: toEl.y + toEl.height / 2,
    };

    const arrow = this.addArrow(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, {
      startBinding: { elementId: fromEl.id, focus: 0, gap: options.gap ?? 8 },
      endBinding: { elementId: toEl.id, focus: 0, gap: options.gap ?? 8 },
      ...options,
    });

    fromEl.boundElements = fromEl.boundElements || [];
    fromEl.boundElements.push({ id: arrow.id, type: "arrow" });

    toEl.boundElements = toEl.boundElements || [];
    toEl.boundElements.push({ id: arrow.id, type: "arrow" });

    return arrow;
  }

  /**
   * Add a dot or tiny marker (freedraw element)
   */
  addDot(x, y, { color = this.strokeColor, size = 2, groupIds = [] } = {}) {
    const el = createBaseElement("freedraw", x, y, 0.0001, 0.0001, {
      index: this.nextIndex(),
      strokeColor: color,
      strokeWidth: size,
      groupIds,
      points: [
        [0, 0],
        [0.0001, 0.0001],
      ],
      pressures: [],
      simulatePressure: true,
      roundness: null,
      roughness: 0,
    });
    this.elements.push(el);
    return el;
  }

  /**
   * Group a list of elements together
   */
  groupElements(elementList) {
    const groupId = generateId();
    for (const el of elementList) {
      if (el && el.groupIds) {
        if (!el.groupIds.includes(groupId)) {
          el.groupIds.push(groupId);
        }
      }
    }
    return groupId;
  }

  /**
   * Add a Frame
   */
  addFrame({ x = 0, y = 0, width = 500, height = 400, name = "Frame" } = {}) {
    const el = createBaseElement("frame", x, y, width, height, {
      index: this.nextIndex(),
      name,
      strokeColor: "#bbb",
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
    });
    this.elements.push(el);
    return el;
  }

  /**
   * Add a Grid of cells (essential for Games like Sudoku, Crosswords, Mazes)
   *
   * @param {Object} options
   * @param {number} options.x - Starting top-left X coordinate
   * @param {number} options.y - Starting top-left Y coordinate
   * @param {number} options.rows - Number of rows
   * @param {number} options.cols - Number of columns
   * @param {number} [options.cellSize=50] - Size of square cell (if cellWidth/cellHeight not provided)
   * @param {number} [options.cellWidth] - Width of cell
   * @param {number} [options.cellHeight] - Height of cell
   * @param {string} [options.strokeColor] - Border color
   * @param {number} [options.strokeWidth=1] - Border width
   * @param {string} [options.backgroundColor="transparent"] - Default cell fill
   * @param {string} [options.renderMode="rectangles"] - "rectangles" (individual cell objects) or "lines" (fast grid lines)
   */
  addGrid({ x = 0, y = 0, rows = 9, cols = 9, cellSize = 50, cellWidth = null, cellHeight = null, strokeColor = this.strokeColor, strokeWidth = 1, backgroundColor = "transparent", roughness = this.roughness, roundness = null, renderMode = "rectangles", groupId = null } = {}) {
    const cw = cellWidth || cellSize;
    const ch = cellHeight || cellSize;
    const totalWidth = cols * cw;
    const totalHeight = rows * ch;

    const actualGroupId = groupId || generateId();
    const cells = [];

    if (renderMode === "rectangles") {
      for (let r = 0; r < rows; r++) {
        const rowCells = [];
        for (let c = 0; c < cols; c++) {
          const cellX = x + c * cw;
          const cellY = y + r * ch;
          const rect = this.addRectangle({
            x: cellX,
            y: cellY,
            width: cw,
            height: ch,
            strokeColor,
            strokeWidth,
            backgroundColor,
            roughness,
            roundness,
            groupIds: [actualGroupId],
          });
          rowCells.push({
            row: r,
            col: c,
            x: cellX,
            y: cellY,
            width: cw,
            height: ch,
            centerX: cellX + cw / 2,
            centerY: cellY + ch / 2,
            rect,
          });
        }
        cells.push(rowCells);
      }
    } else {
      // Lines mode: outer box + horizontal & vertical lines
      this.addRectangle({
        x,
        y,
        width: totalWidth,
        height: totalHeight,
        strokeColor,
        strokeWidth,
        roughness,
        groupIds: [actualGroupId],
      });

      // Horizontal dividers
      for (let r = 1; r < rows; r++) {
        this.addLineBetween(x, y + r * ch, x + totalWidth, y + r * ch, {
          strokeColor,
          strokeWidth,
          roughness,
          groupIds: [actualGroupId],
        });
      }

      // Vertical dividers
      for (let c = 1; c < cols; c++) {
        this.addLineBetween(x + c * cw, y, x + c * cw, y + totalHeight, {
          strokeColor,
          strokeWidth,
          roughness,
          groupIds: [actualGroupId],
        });
      }

      for (let r = 0; r < rows; r++) {
        const rowCells = [];
        for (let c = 0; c < cols; c++) {
          const cellX = x + c * cw;
          const cellY = y + r * ch;
          rowCells.push({
            row: r,
            col: c,
            x: cellX,
            y: cellY,
            width: cw,
            height: ch,
            centerX: cellX + cw / 2,
            centerY: cellY + ch / 2,
          });
        }
        cells.push(rowCells);
      }
    }

    return {
      x,
      y,
      rows,
      cols,
      cellWidth: cw,
      cellHeight: ch,
      totalWidth,
      totalHeight,
      groupId: actualGroupId,
      cells,
      getCell(r, c) {
        if (cells[r] && cells[r][c]) return cells[r][c];
        return null;
      },
    };
  }

  /**
   * Calculate bounding box containing all non-deleted elements
   */
  getBounds() {
    if (this.elements.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of this.elements) {
      if (el.isDeleted) continue;
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Build complete Excalidraw JSON document object
   */
  toObject() {
    return {
      type: "excalidraw",
      version: 2,
      source: "https://github.com/zsviczian/obsidian-excalidraw-plugin",
      elements: this.elements,
      appState: {
        theme: this.theme,
        viewBackgroundColor: this.viewBackgroundColor,
        currentItemStrokeColor: this.strokeColor,
        currentItemBackgroundColor: "transparent",
        currentItemFillStyle: "solid",
        currentItemStrokeWidth: 1,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: this.roughness,
        currentItemOpacity: 100,
        currentItemFontFamily: this.fontFamily,
        gridSize: this.gridSize,
        zoom: { value: this.zoom },
        scrollX: 0,
        scrollY: 0,
        ...this.appState,
      },
      files: {},
    };
  }

  /**
   * Serialize document to JSON string
   */
  toJSON(indent = 2) {
    return JSON.stringify(this.toObject(), null, indent);
  }

  /**
   * Wrap Excalidraw document into Obsidian Excalidraw Markdown format
   */
  toObsidianMarkdown(options = {}) {
    const tags = options.tags || this.tags;
    const tagList = Array.isArray(tags) ? tags.join(", ") : String(tags);
    const jsonStr = this.toJSON(options.indent ?? 2);

    return `---
excalidraw-plugin: parsed
tags: [${tagList}]
---
==⚠ Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==
# Excalidraw Data
## Text Elements
## Drawing
\`\`\`json
${jsonStr}
\`\`\`
%%
`;
  }

  /**
   * Save to file (supports .excalidraw.md, .excalidraw, .json, or base filename)
   *
   * @param {string} filepath - Output path
   * @param {Object} [options]
   * @param {'auto'|'all'|'md'|'json'} [options.format='auto']
   * @returns {{ jsonPath?: string, mdPath?: string }}
   */
  save(filepath, options = {}) {
    const format = options.format || "auto";
    const dirname = path.dirname(filepath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    const results = {};

    if (format === "all") {
      let base = filepath;
      if (base.endsWith(".excalidraw.md")) base = base.slice(0, -".excalidraw.md".length);
      else if (base.endsWith(".excalidraw")) base = base.slice(0, -".excalidraw".length);
      else if (base.endsWith(".md")) base = base.slice(0, -".md".length);
      else if (base.endsWith(".json")) base = base.slice(0, -".json".length);

      const jsonPath = `${base}.excalidraw`;
      const mdPath = `${base}.excalidraw.md`;

      fs.writeFileSync(jsonPath, this.toJSON(), "utf8");
      fs.writeFileSync(mdPath, this.toObsidianMarkdown(options), "utf8");
      results.jsonPath = jsonPath;
      results.mdPath = mdPath;
    } else if (format === "md" || filepath.endsWith(".excalidraw.md") || (format === "auto" && filepath.endsWith(".md"))) {
      let targetPath = filepath;
      if (!targetPath.endsWith(".excalidraw.md") && targetPath.endsWith(".md")) {
        targetPath = targetPath.replace(/\.md$/, ".excalidraw.md");
      } else if (!targetPath.endsWith(".md")) {
        targetPath = `${targetPath}.excalidraw.md`;
      }
      fs.writeFileSync(targetPath, this.toObsidianMarkdown(options), "utf8");
      results.mdPath = targetPath;
    } else {
      // JSON / standard excalidraw
      let targetPath = filepath;
      if (!targetPath.endsWith(".excalidraw") && !targetPath.endsWith(".json")) {
        targetPath = `${targetPath}.excalidraw`;
      }
      fs.writeFileSync(targetPath, this.toJSON(), "utf8");
      results.jsonPath = targetPath;
    }

    return results;
  }

  /**
   * Parse an existing Excalidraw JSON or Obsidian Markdown string into a new ExcalidrawDoc instance
   */
  static fromObsidianMarkdown(markdownStr) {
    const match = markdownStr.match(/```json\s*([\s\S]*?)\s*```/);
    if (!match) {
      throw new Error("Could not find json code block in Obsidian Excalidraw markdown.");
    }
    const data = JSON.parse(match[1]);
    return ExcalidrawDoc.fromObject(data);
  }

  /**
   * Instantiate from Excalidraw object
   */
  static fromObject(data) {
    const doc = new ExcalidrawDoc({
      theme: data.appState?.theme,
      viewBackgroundColor: data.appState?.viewBackgroundColor,
      roughness: data.appState?.currentItemRoughness,
      fontFamily: data.appState?.currentItemFontFamily,
      gridSize: data.appState?.gridSize,
      zoom: data.appState?.zoom?.value,
    });
    doc.elements = Array.isArray(data.elements) ? [...data.elements] : [];
    doc.elementIndex = doc.elements.length;
    return doc;
  }

  /**
   * Load from file (.excalidraw, .json, or .excalidraw.md)
   */
  static load(filepath) {
    const content = fs.readFileSync(filepath, "utf8");
    if (filepath.endsWith(".md") || content.includes("excalidraw-plugin:")) {
      return ExcalidrawDoc.fromObsidianMarkdown(content);
    }
    return ExcalidrawDoc.fromObject(JSON.parse(content));
  }
}

/**
 * Convenient factory function
 */
export function createExcalidrawDoc(options = {}) {
  return new ExcalidrawDoc(options);
}

export default ExcalidrawDoc;
