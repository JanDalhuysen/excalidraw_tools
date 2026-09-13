// ============================================================================
// Excalidraw Sheet Music & Standard MIDI Exporter for Mini DAW
// Generates:
// 1. Standard MIDI (.mid) files
// 2. Interactive Excalidraw Sheet Music (.excalidraw.md) for Obsidian
//
// Live sync: every note part (head, stem, label, accidental) is tagged with
// customData metadata and grouped together, so score_parser.js can map edits
// made in Excalidraw/Obsidian back to piano-roll notes in real time.
// ============================================================================

(function () {
  // --- 1. MIDI Exporter ---
  function encodeVLQ(value) {
    let bytes = [value & 0x7f];
    while ((value >>= 7) > 0) {
      bytes.push((value & 0x7f) | 0x80);
    }
    return bytes.reverse();
  }

  const MidiExporter = {
    exportNotes(notes, bpm = 120, filename = `composition_${Date.now()}.mid`) {
      if (!notes || notes.length === 0) {
        alert("No notes to export! Add some notes on the piano roll first.");
        return;
      }

      const TICKS_PER_BEAT = 480;
      const TICKS_PER_STEP = TICKS_PER_BEAT / 4; // 120 ticks per 16th note

      const rawEvents = [];
      notes.forEach((n) => {
        const ch = n.type === "bass" ? 1 : 0;
        rawEvents.push({
          tick: n.step * TICKS_PER_STEP,
          type: "on",
          pitch: n.midi,
          velocity: 100,
          ch,
        });
        rawEvents.push({
          tick: (n.step + n.length) * TICKS_PER_STEP,
          type: "off",
          pitch: n.midi,
          velocity: 0,
          ch,
        });
      });

      rawEvents.sort((a, b) => {
        if (a.tick !== b.tick) return a.tick - b.tick;
        if (a.type === "off" && b.type === "on") return -1;
        if (a.type === "on" && b.type === "off") return 1;
        return 0;
      });

      const trackEvents = [];
      function addEvent(delta, ...bytes) {
        trackEvents.push(...encodeVLQ(delta), ...bytes);
      }

      // Tempo
      const usPerBeat = Math.round(60000000 / bpm);
      addEvent(0, 0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff);

      // Time signature 4/4
      addEvent(0, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

      let lastTick = 0;
      rawEvents.forEach((ev) => {
        const delta = ev.tick - lastTick;
        lastTick = ev.tick;
        const status = (ev.type === "on" ? 0x90 : 0x80) | (ev.ch & 0x0f);
        addEvent(delta, status, ev.pitch, ev.velocity);
      });

      // End of Track
      addEvent(0, 0xff, 0x2f, 0x00);

      const header = [
        0x4d,
        0x54,
        0x68,
        0x64, // 'MThd'
        0x00,
        0x00,
        0x00,
        0x06,
        0x00,
        0x00, // Format 0
        0x00,
        0x01, // 1 Track
        (TICKS_PER_BEAT >> 8) & 0xff,
        TICKS_PER_BEAT & 0xff,
      ];

      const trackLen = trackEvents.length;
      const trackHeader = [
        0x4d,
        0x54,
        0x72,
        0x6b, // 'MTrk'
        (trackLen >> 24) & 0xff,
        (trackLen >> 16) & 0xff,
        (trackLen >> 8) & 0xff,
        trackLen & 0xff,
      ];

      const midiBytes = new Uint8Array([...header, ...trackHeader, ...trackEvents]);
      const blob = new Blob([midiBytes], { type: "audio/midi" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };

  // --- 2. Excalidraw Sheet Music Exporter ---
  const SEMITONE_TO_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const IS_ACCIDENTAL = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

  function midiToDiatonic(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = midi % 12;
    const stepInOctave = SEMITONE_TO_STEP[semitone];
    const sharp = IS_ACCIDENTAL[semitone] === 1;
    const step = (octave - 4) * 7 + stepInOctave;
    const name = `${NOTE_NAMES[semitone]}${octave}`;
    return { step, sharp, name };
  }

  function randomId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let id = "";
    for (let i = 0; i < 20; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  function createExcalidrawElement(type, x, y, width, height, extra = {}) {
    return {
      id: extra.id || randomId(),
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(0.0001, Math.round(width)),
      height: Math.max(0.0001, Math.round(height)),
      angle: 0,
      strokeColor: extra.strokeColor || "#1e1e1e",
      backgroundColor: extra.backgroundColor || "transparent",
      fillStyle: extra.fillStyle || "solid",
      strokeWidth: extra.strokeWidth !== undefined ? extra.strokeWidth : 1,
      strokeStyle: extra.strokeStyle || "solid",
      roughness: extra.roughness !== undefined ? extra.roughness : 0,
      opacity: extra.opacity || 100,
      groupIds: extra.groupIds || [],
      frameId: null,
      index: extra.index || "a0001",
      roundness: extra.roundness !== undefined ? extra.roundness : null,
      seed: Math.floor(Math.random() * 2147483647),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: null,
      locked: false,
      ...extra,
    };
  }

  // Builds the .excalidraw.md content string (returns null when there are no notes)
  function buildExcalidrawMd(notes, options = {}) {
    if (!notes || notes.length === 0) {
      alert("No notes to export! Add some notes on the piano roll first.");
      return null;
    }

    const { title = "🎵 Sheet Music Score", bpm = 110, filename = `sheet_music_${Date.now()}.excalidraw.md`, barsPerSystem = 4 } = options;

    const elements = [];
    let indexCounter = 1;
    const nextIndex = () => "a" + String(indexCounter++).padStart(5, "0");

    // Add Text helper
    const addText = (x, y, text, fontSize, color = "#111827", opts = {}) => {
      const textStr = String(text);
      const approxWidth = Math.max(12, Math.round(textStr.length * fontSize * 0.58));
      const approxHeight = Math.max(12, Math.round(fontSize * 1.3));
      elements.push(
        createExcalidrawElement("text", x, y, approxWidth, approxHeight, {
          index: nextIndex(),
          text: textStr,
          originalText: textStr,
          fontSize,
          fontFamily: 2, // Normal clean font
          textAlign: "left",
          verticalAlign: "top",
          strokeColor: color,
          lineHeight: 1.25,
          baseline: Math.round(fontSize * 0.8),
          groupIds: opts.groupIds || [],
          ...(opts.customData ? { customData: opts.customData } : {}),
        }),
      );
    };

    // Add Line helper
    const addLine = (x1, y1, x2, y2, opts = {}) => {
      elements.push(
        createExcalidrawElement("line", x1, y1, Math.abs(x2 - x1) || 1, Math.abs(y2 - y1) || 1, {
          index: nextIndex(),
          points: [
            [0, 0],
            [x2 - x1, y2 - y1],
          ],
          strokeColor: opts.strokeColor || "#2d3748",
          strokeWidth: opts.strokeWidth || 1,
          roughness: 0,
          groupIds: opts.groupIds || [],
          ...(opts.customData ? { customData: opts.customData } : {}),
        }),
      );
    };

    // Add Ellipse helper
    const addEllipse = (cx, cy, w, h, opts = {}) => {
      elements.push(
        createExcalidrawElement("ellipse", cx - w / 2, cy - h / 2, w, h, {
          index: nextIndex(),
          strokeColor: opts.strokeColor || "#1a202c",
          backgroundColor: opts.backgroundColor || "#1a202c",
          fillStyle: "solid",
          strokeWidth: opts.strokeWidth || 1.5,
          roughness: 0,
          groupIds: opts.groupIds || [],
          ...(opts.customData ? { customData: opts.customData } : {}),
        }),
      );
    };

    // Title & Subtitle
    addText(80, 40, title, 28, "#111827");
    addText(80, 80, `Tempo: ${bpm} BPM • 4/4 Time Signature • Key of C • Generated by Mini DAW`, 13, "#4b5563");

    // Staff dimensions
    const staffStartX = 80;
    const staffWidth = 1040;
    const staffEndX = staffStartX + staffWidth;
    const lineSpacing = 12; // 12px between staff lines
    const staffHeight = lineSpacing * 4; // 48px
    const systemGap = 160;
    const firstSystemTopY = 140;

    // Find total bars needed
    let maxStep = 0;
    notes.forEach((n) => {
      maxStep = Math.max(maxStep, n.step + (n.length || 4));
    });
    const totalBars = Math.max(4, Math.ceil(maxStep / 16));
    const numSystems = Math.ceil(totalBars / barsPerSystem);

    const clefIndent = 80;
    const musicWidth = staffWidth - clefIndent;
    const barWidth = musicWidth / barsPerSystem;

    // 1. Draw Staves
    for (let s = 0; s < numSystems; s++) {
      const sysTopY = firstSystemTopY + s * systemGap;

      // 5 horizontal lines
      for (let l = 0; l < 5; l++) {
        const ly = sysTopY + l * lineSpacing;
        addLine(staffStartX, ly, staffEndX, ly, { strokeColor: "#2d3748", strokeWidth: 1 });
      }

      // Left vertical staff line
      addLine(staffStartX, sysTopY, staffStartX, sysTopY + staffHeight, {
        strokeColor: "#2d3748",
        strokeWidth: 2,
      });

      // Treble clef symbol
      addText(staffStartX + 12, sysTopY - 14, "𝄞", 48, "#1a202c");

      // 4/4 Time Signature on first system
      if (s === 0) {
        addText(staffStartX + 52, sysTopY - 2, "4", 22, "#1a202c");
        addText(staffStartX + 52, sysTopY + 22, "4", 22, "#1a202c");
      }

      // Measure Bar Lines
      for (let b = 1; b <= barsPerSystem; b++) {
        const barNum = s * barsPerSystem + b;
        if (barNum > totalBars) break;

        const barLineX = staffStartX + clefIndent + b * barWidth;
        const isLastBar = barNum === totalBars;

        if (isLastBar) {
          // Final Double Bar
          addLine(barLineX - 5, sysTopY, barLineX - 5, sysTopY + staffHeight, {
            strokeColor: "#1a202c",
            strokeWidth: 1.5,
          });
          addLine(barLineX, sysTopY, barLineX, sysTopY + staffHeight, {
            strokeColor: "#1a202c",
            strokeWidth: 4,
          });
        } else {
          addLine(barLineX, sysTopY, barLineX, sysTopY + staffHeight, {
            strokeColor: "#4a5568",
            strokeWidth: 1.2,
          });
        }

        // Measure number above bar
        const prevBarLineX = staffStartX + clefIndent + (b - 1) * barWidth;
        addText(prevBarLineX + 6, sysTopY - 20, `${barNum}`, 11, "#718096");
      }
    }

    // 2. Draw Notes
    notes.forEach((note) => {
      const barIndex = Math.floor(note.step / 16);
      const systemIndex = Math.floor(barIndex / 4);
      const barInSys = barIndex % 4;
      const stepInBar = note.step % 16;

      if (systemIndex >= numSystems) return;

      const sysTopY = firstSystemTopY + systemIndex * systemGap;
      const bottomLineY = sysTopY + staffHeight;

      const barStartX = staffStartX + clefIndent + barInSys * barWidth;
      const noteX = barStartX + 16 + (stepInBar / 16) * (barWidth - 32);

      const diatonic = midiToDiatonic(note.midi);
      const noteY = bottomLineY - (diatonic.step - 2) * (lineSpacing / 2);

      const isHalfOrWhole = (note.length || 4) >= 8;
      const isWhole = (note.length || 4) >= 16;

      // Live-sync metadata: tag every note part so edits made in
      // Excalidraw can be mapped back to piano-roll notes by
      // score_parser.js. Head + stem + label + accidental share one
      // group so they move/delete/copy together in Excalidraw.
      const noteLength = note.length || 4;
      const label = note.text || diatonic.name;
      const groupId = randomId();
      const noteMeta = {
        minidaw: 1,
        role: "notehead",
        noteId: String(note.id ?? ""),
        midi: note.midi,
        step: note.step,
        length: noteLength,
        type: note.type === "bass" ? "bass" : "melody",
        text: note.text ?? null,
        label,
        diatonicStep: diatonic.step,
        sysTopY,
        barStartX,
        barWidth,
        systemIndex,
        barInSys,
        barsPerSystem,
        cx: noteX,
        cy: noteY,
      };
      const partMeta = (role) => ({ minidaw: 1, role, noteId: noteMeta.noteId });

      // Ledger lines for Middle C or low/high notes
      if (diatonic.step <= 0) {
        for (let ls = 0; ls >= diatonic.step; ls -= 2) {
          const ledgerY = bottomLineY - (ls - 2) * (lineSpacing / 2);
          addLine(noteX - 11, ledgerY, noteX + 11, ledgerY, {
            strokeColor: "#2d3748",
            strokeWidth: 1.2,
          });
        }
      } else if (diatonic.step >= 12) {
        for (let ls = 12; ls <= diatonic.step; ls += 2) {
          const ledgerY = bottomLineY - (ls - 2) * (lineSpacing / 2);
          addLine(noteX - 11, ledgerY, noteX + 11, ledgerY, {
            strokeColor: "#2d3748",
            strokeWidth: 1.2,
          });
        }
      }

      // Accidental (#)
      if (diatonic.sharp) {
        addText(noteX - 16, noteY - 10, "♯", 16, "#1a202c", {
          groupIds: [groupId],
          customData: partMeta("accidental"),
        });
      }

      // Note Head
      const headW = 13;
      const headH = 9.5;
      addEllipse(noteX, noteY, headW, headH, {
        backgroundColor: isHalfOrWhole ? "#ffffff" : "#1a202c",
        strokeColor: "#1a202c",
        groupIds: [groupId],
        customData: noteMeta,
      });

      // Stem
      if (!isWhole) {
        const stemHeight = 28;
        if (diatonic.step < 6) {
          // Below B4: stem UP on right
          const sx = noteX + headW / 2 - 1;
          addLine(sx, noteY, sx, noteY - stemHeight, {
            strokeColor: "#1a202c",
            strokeWidth: 1.4,
            groupIds: [groupId],
            customData: partMeta("stem"),
          });
        } else {
          // B4 and above: stem DOWN on left
          const sx = noteX - headW / 2 + 1;
          addLine(sx, noteY, sx, noteY + stemHeight, {
            strokeColor: "#1a202c",
            strokeWidth: 1.4,
            groupIds: [groupId],
            customData: partMeta("stem"),
          });
        }
      }

      // Note Pitch / Name label underneath
      addText(noteX - 8, sysTopY + staffHeight + 14, label, 11, "#6b7280", {
        groupIds: [groupId],
        customData: partMeta("label"),
      });
    });

    // Construct Complete Excalidraw JSON Document
    const excalidrawDoc = {
      type: "excalidraw",
      version: 2,
      source: "https://github.com/zsviczian/obsidian-excalidraw-plugin",
      elements,
      appState: {
        theme: "light",
        viewBackgroundColor: "#ffffff",
        currentItemStrokeColor: "#1e1e1e",
        currentItemBackgroundColor: "transparent",
        currentItemFillStyle: "solid",
        currentItemStrokeWidth: 1,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 0,
        currentItemOpacity: 100,
        currentItemFontFamily: 2,
        gridSize: 20,
        zoom: { value: 1 },
        scrollX: 0,
        scrollY: 0,
      },
      files: {},
    };

    // Wrap in Obsidian Excalidraw Markdown format
    const jsonStr = JSON.stringify(excalidrawDoc, null, 2);
    const markdownContent = `---
excalidraw-plugin: parsed
tags: [excalidraw, sheet-music, music-score]
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

    return markdownContent;
  }

  const SheetMusicExporter = {
    buildExcalidrawMd,

    exportToExcalidrawMd(notes, options = {}) {
      const markdownContent = buildExcalidrawMd(notes, options);
      if (!markdownContent) return;
      const filename = options.filename || `sheet_music_${Date.now()}.excalidraw.md`;

      const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };

  window.MidiExporter = MidiExporter;
  window.SheetMusicExporter = SheetMusicExporter;
})();
