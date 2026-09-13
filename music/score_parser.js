// ========================================================
// Excalidraw Score Parser for Mini DAW Live Sync
// Reads a .excalidraw.md file and reconstructs piano-roll
// notes from the tagged notehead ellipses produced by
// public/excalidraw_sheet.js.
//
// Hybrid strategy:
//  - Pitch, time, length, track and text all come from the
//    element's customData snapshot (exact, survives re-saves).
//  - If the notehead has been MOVED in Excalidraw, the new
//    time/pitch is recomputed from its new center position:
//      horizontal -> bar + 16th-step within the bar
//      vertical   -> diatonic step on the staff (natural note)
//  - Deleting a notehead deletes the note; copy/pasting one
//    duplicates the note at its new position.
//  - Editing a note's label text in Excalidraw updates the
//    note's text (e.g. lyrics).
// ========================================================

const HEAD_STEP_PX = 6; // vertical px per diatonic step (lineSpacing / 2)
const BAR_PAD_X = 16; // px from bar start to first note position
const BAR_INNER_X = 32; // total horizontal padding inside a bar
const STEPS_PER_BAR = 16;
const MOVE_TOLERANCE_PX = 3; // absorbs float rounding on re-save
const MIN_MIDI = 36; // C2 (matches CONFIG in app.js)
const MAX_MIDI = 84; // C6

const DIATONIC_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

function diatonicToMidi(diatonicStep) {
  const octave = Math.floor(diatonicStep / 7) + 4;
  const stepInOctave = diatonicStep - (octave - 4) * 7;
  return (octave + 1) * 12 + DIATONIC_SEMIS[stepInOctave];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Extract the JSON drawing block from Obsidian-flavored .excalidraw.md
// (also accepts a raw .excalidraw file that is pure JSON)
function extractDrawingJson(markdown) {
  const block = markdown.match(/```json\s*([\s\S]*?)```/);
  return JSON.parse(block ? block[1] : markdown);
}

// In "parsed" Obsidian files, text element content may live in the
// "## Text Elements" section as blocks ending with "^elementId".
// The section (when present) is authoritative over the JSON text field.
function extractTextElements(markdown) {
  const map = new Map();
  const section = markdown.match(/## Text Elements\s*\n([\s\S]*?)(?=\n## |\n%%|$)/);
  if (!section) return map;
  for (const block of section[1].split(/\n\s*\n/)) {
    const m = block.match(/\^([A-Za-z0-9_-]+)\s*$/);
    if (!m) continue;
    map.set(m[1], block.slice(0, m.index).replace(/\s+$/, ""));
  }
  return map;
}

// Returns { notes, totalBars } or null when the file is not a Mini DAW score.
export function parseExcalidrawScore(markdown) {
  let doc;
  try {
    doc = extractDrawingJson(markdown);
  } catch {
    return null;
  }
  const elements = Array.isArray(doc?.elements) ? doc.elements : [];
  const hasMarkers = elements.some((el) => el.customData && el.customData.minidaw);
  if (!hasMarkers) return null;

  const textOverrides = extractTextElements(markdown);

  // Current text of each label element (keyed by the note it belongs to)
  const labelByNoteId = new Map();
  for (const el of elements) {
    const cd = el.customData;
    if (el.type === "text" && !el.isDeleted && cd && cd.minidaw && cd.role === "label") {
      labelByNoteId.set(cd.noteId, textOverrides.get(el.id) ?? el.text ?? "");
    }
  }

  const notes = [];
  for (const el of elements) {
    const cd = el.customData;
    if (el.type !== "ellipse" || el.isDeleted || !cd || !cd.minidaw || cd.role !== "notehead") {
      continue;
    }

    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const dx = cx - cd.cx;
    const dy = cy - cd.cy;

    let step = cd.step;
    let midi = cd.midi;

    // Horizontal move -> change time (bar + 16th-step within the bar)
    if (Math.abs(dx) > MOVE_TOLERANCE_PX) {
      const bps = cd.barsPerSystem || 4;
      const musicStartX = cd.barStartX - cd.barInSys * cd.barWidth;
      const barInSys = clamp(Math.floor((cx - musicStartX) / cd.barWidth), 0, bps - 1);
      const pxPerStep = (cd.barWidth - BAR_INNER_X) / STEPS_PER_BAR;
      const stepInBar = clamp(Math.round((cx - musicStartX - barInSys * cd.barWidth - BAR_PAD_X) / pxPerStep), 0, STEPS_PER_BAR - 1);
      step = (cd.systemIndex * bps + barInSys) * STEPS_PER_BAR + stepInBar;
    }

    // Vertical move -> change pitch (natural note at the new staff position;
    // unmoved notes keep their exact original pitch, including sharps)
    if (Math.abs(dy) > MOVE_TOLERANCE_PX) {
      const diatonic = cd.diatonicStep + Math.round((cd.cy - cy) / HEAD_STEP_PX);
      midi = clamp(diatonicToMidi(diatonic), MIN_MIDI, MAX_MIDI);
    }

    // Label edited in Excalidraw -> becomes the note's text (e.g. lyrics)
    let text = cd.text ?? undefined;
    const label = labelByNoteId.get(cd.noteId);
    if (label !== undefined && label !== cd.label) {
      text = label || undefined;
    }

    const note = {
      id: "live_" + el.id,
      step,
      midi,
      length: cd.length || 4,
      type: cd.type === "bass" ? "bass" : "melody",
    };
    if (text) note.text = text;
    notes.push(note);
  }

  notes.sort((a, b) => a.step - b.step || a.midi - b.midi);

  let maxEnd = 0;
  for (const n of notes) maxEnd = Math.max(maxEnd, n.step + n.length);
  const totalBars = Math.max(4, Math.ceil(maxEnd / STEPS_PER_BAR));

  return { notes, totalBars };
}
