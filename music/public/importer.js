// ========================================================
// Universal Music Importer: MIDI (.mid) & MusicXML (.xml / .musicxml)
// Enhanced BPM / Tempo detection and robust track parsing
// ========================================================

class MusicImporter {
  // Main entry point: takes a File object (from input or drag & drop)
  static async importFile(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".mid") || fileName.endsWith(".midi")) {
      const buffer = await file.arrayBuffer();
      return this.parseMidi(buffer);
    } else if (fileName.endsWith(".musicxml") || fileName.endsWith(".xml")) {
      const text = await file.text();
      return this.parseMusicXML(text);
    } else {
      // Auto-detect file content type
      const buffer = await file.arrayBuffer();
      const headerBytes = new Uint8Array(buffer.slice(0, 4));
      const headerStr = String.fromCharCode(...headerBytes);

      if (headerStr === "MThd") {
        return this.parseMidi(buffer);
      } else {
        const text = new TextDecoder().decode(buffer);
        if (text.includes("<score-partwise") || text.includes("<?xml")) {
          return this.parseMusicXML(text);
        }
      }
      throw new Error("Unsupported format. Please select a .mid, .midi, .musicxml, or .xml file.");
    }
  }

  // =========================================================================
  // 1. Standard MIDI (.mid / .midi) Parser with High-Precision BPM Detection
  // =========================================================================
  static parseMidi(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    let offset = 0;

    const readString = (len) => {
      let str = "";
      for (let i = 0; i < len; i++) {
        str += String.fromCharCode(view.getUint8(offset++));
      }
      return str;
    };

    // Verify MThd header
    const headerChunk = readString(4);
    if (headerChunk !== "MThd") {
      throw new Error("Not a valid MIDI file (missing MThd chunk).");
    }

    const headerLength = view.getUint32(offset);
    offset += 4;
    const format = view.getUint16(offset);
    offset += 2;
    const numTracks = view.getUint16(offset);
    offset += 2;
    const division = view.getUint16(offset);
    offset += 2;

    // Skip any extra header bytes if headerLength > 6
    if (headerLength > 6) {
      offset += headerLength - 6;
    }

    // Ticks per quarter note
    const ticksPerQuarter = division & 0x8000 ? 480 : division;
    let detectedBpm = 120;
    let bpmFound = false;
    const rawNotes = [];

    // Parse each MTrk track
    for (let t = 0; t < numTracks && offset < view.byteLength; t++) {
      const trackHeader = readString(4);
      if (trackHeader !== "MTrk") {
        // In case of unexpected chunk, search for next MTrk
        let foundMTrk = false;
        while (offset + 4 <= view.byteLength) {
          const testTag = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
          if (testTag === "MTrk") {
            offset += 4;
            foundMTrk = true;
            break;
          }
          offset++;
        }
        if (!foundMTrk) break;
      }

      const trackLength = view.getUint32(offset);
      offset += 4;
      const trackEnd = offset + trackLength;

      let currentTick = 0;
      let runningStatus = 0;
      const activeNotes = new Map(); // key: channel_pitch -> { startTick, velocity }

      while (offset < trackEnd && offset < view.byteLength) {
        // 1. Read variable-length delta time
        let delta = 0;
        let b = 0;
        do {
          b = view.getUint8(offset++);
          delta = (delta << 7) | (b & 0x7f);
        } while (b & 0x80);

        currentTick += delta;

        // 2. Read event status byte
        let status = view.getUint8(offset);
        if (status < 0x80) {
          // Running status: reuse previous voice status byte without advancing offset
          status = runningStatus;
        } else {
          offset++;
          // Only channel voice messages (0x80 - 0xEF) set running status
          if (status < 0xf0) {
            runningStatus = status;
          } else {
            // System common, sysex, and meta events do NOT set running status
            runningStatus = 0;
          }
        }

        const eventType = status & 0xf0;
        const channel = status & 0x0f;

        if (status === 0xff) {
          // Meta Event
          const metaType = view.getUint8(offset++);
          let metaLength = 0;
          let mb = 0;
          do {
            mb = view.getUint8(offset++);
            metaLength = (metaLength << 7) | (mb & 0x7f);
          } while (mb & 0x80);

          // 0x51: Set Tempo meta event
          if (metaType === 0x51 && metaLength === 3) {
            const b1 = view.getUint8(offset);
            const b2 = view.getUint8(offset + 1);
            const b3 = view.getUint8(offset + 2);
            const microsecondsPerQuarter = b1 * 65536 + b2 * 256 + b3;
            if (microsecondsPerQuarter > 0) {
              const bpm = Math.round(60000000 / microsecondsPerQuarter);
              if (bpm >= 20 && bpm <= 400) {
                detectedBpm = bpm;
                bpmFound = true;
              }
            }
          } else if (metaType === 0x2f) {
            // End of Track
            offset += metaLength;
            break;
          }

          offset += metaLength;
        } else if (status === 0xf0 || status === 0xf7) {
          // Sysex Event
          let sysLength = 0;
          let sb = 0;
          do {
            sb = view.getUint8(offset++);
            sysLength = (sysLength << 7) | (sb & 0x7f);
          } while (sb & 0x80);
          offset += sysLength;
        } else if (eventType === 0x90) {
          // Note On
          const pitch = view.getUint8(offset++);
          const velocity = view.getUint8(offset++);
          const key = `${channel}_${pitch}`;

          if (velocity > 0) {
            activeNotes.set(key, { startTick: currentTick, velocity, trackIndex: t });
          } else if (activeNotes.has(key)) {
            const startInfo = activeNotes.get(key);
            activeNotes.delete(key);
            rawNotes.push({
              pitch,
              startTick: startInfo.startTick,
              durationTicks: Math.max(1, currentTick - startInfo.startTick),
              trackIndex: t,
            });
          }
        } else if (eventType === 0x80) {
          // Note Off
          const pitch = view.getUint8(offset++);
          view.getUint8(offset++); // velocity
          const key = `${channel}_${pitch}`;
          if (activeNotes.has(key)) {
            const startInfo = activeNotes.get(key);
            activeNotes.delete(key);
            rawNotes.push({
              pitch,
              startTick: startInfo.startTick,
              durationTicks: Math.max(1, currentTick - startInfo.startTick),
              trackIndex: t,
            });
          }
        } else if (eventType === 0xa0 || eventType === 0xb0 || eventType === 0xe0) {
          // Polyphonic key pressure, Control change, Pitch wheel change (2 data bytes)
          offset += 2;
        } else if (eventType === 0xc0 || eventType === 0xd0) {
          // Program change, Channel pressure (1 data byte)
          offset += 1;
        }
      }

      // Close any notes that were still sounding at the end of track
      activeNotes.forEach((startInfo, key) => {
        const pitch = parseInt(key.split("_")[1], 10);
        rawNotes.push({
          pitch,
          startTick: startInfo.startTick,
          durationTicks: Math.max(ticksPerQuarter / 2, currentTick - startInfo.startTick),
          trackIndex: t,
        });
      });

      // Synchronize exact track ending boundary
      offset = trackEnd;
    }

    if (rawNotes.length === 0) {
      throw new Error("No musical notes found in this MIDI file.");
    }

    // Normalize notes and quantize to 16th-note steps
    const firstTick = Math.min(...rawNotes.map((n) => n.startTick));
    let maxEndStep = 0;

    const parsedNotes = rawNotes.map((n, idx) => {
      const relativeTick = n.startTick - firstTick;
      const step = Math.round((relativeTick / ticksPerQuarter) * 4);
      const length = Math.max(1, Math.round((n.durationTicks / ticksPerQuarter) * 4));

      maxEndStep = Math.max(maxEndStep, step + length);

      // Low notes mapped to Bass (purple), higher notes to Melody (green)
      const type = n.pitch < 50 ? "bass" : "melody";

      return {
        id: `import_${idx}_${Date.now()}`,
        step,
        midi: n.pitch,
        length,
        type,
      };
    });

    const totalBars = Math.max(16, Math.ceil(maxEndStep / 16));

    return {
      format: "MIDI",
      bpm: detectedBpm,
      bpmDetected: bpmFound,
      notes: parsedNotes,
      totalBars,
    };
  }

  // =========================================================================
  // 2. MusicXML (.musicxml / .xml) Parser with BPM Detection
  // =========================================================================
  static parseMusicXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Failed to parse MusicXML file: " + parserError.textContent);
    }

    let detectedBpm = 120;
    let bpmFound = false;

    // Detect BPM from <sound tempo="..."/>
    const soundTempo = xmlDoc.querySelector("sound[tempo]");
    if (soundTempo) {
      const t = parseFloat(soundTempo.getAttribute("tempo"));
      if (!isNaN(t) && t >= 20 && t <= 400) {
        detectedBpm = Math.round(t);
        bpmFound = true;
      }
    }

    // Detect BPM from <per-minute> inside <metronome>
    if (!bpmFound) {
      const perMinute = xmlDoc.querySelector("metronome per-minute");
      if (perMinute) {
        const t = parseFloat(perMinute.textContent);
        if (!isNaN(t) && t >= 20 && t <= 400) {
          detectedBpm = Math.round(t);
          bpmFound = true;
        }
      }
    }

    const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const parsedNotes = [];
    let noteIdCounter = 1;
    let maxEndStep = 0;

    const parts = xmlDoc.querySelectorAll("part");
    parts.forEach((part, partIdx) => {
      let partTimeTicks = 0;
      let divisions = 4; // Default ticks per quarter note

      const measures = part.querySelectorAll("measure");
      measures.forEach((measure) => {
        const divEl = measure.querySelector("divisions");
        if (divEl) {
          const d = parseInt(divEl.textContent, 10);
          if (!isNaN(d) && d > 0) divisions = d;
        }

        let measureTimeTicks = 0;
        let lastNoteStart = 0;

        const children = measure.children;
        for (let i = 0; i < children.length; i++) {
          const node = children[i];
          if (node.tagName !== "note") continue;

          const isRest = node.querySelector("rest") !== null;
          const isChord = node.querySelector("chord") !== null;
          const durEl = node.querySelector("duration");
          const durationTicks = durEl ? parseInt(durEl.textContent, 10) : divisions;

          let noteStartTick = 0;
          if (isChord) {
            noteStartTick = lastNoteStart;
          } else {
            noteStartTick = partTimeTicks + measureTimeTicks;
            lastNoteStart = noteStartTick;
            measureTimeTicks += durationTicks;
          }

          if (isRest) continue;

          const pitchEl = node.querySelector("pitch");
          if (!pitchEl) continue;

          const stepStr = pitchEl.querySelector("step")?.textContent || "C";
          const alterVal = parseInt(pitchEl.querySelector("alter")?.textContent || "0", 10);
          const octaveVal = parseInt(pitchEl.querySelector("octave")?.textContent || "4", 10);

          const semitone = (SEMITONES[stepStr] || 0) + (isNaN(alterVal) ? 0 : alterVal);
          const midi = (octaveVal + 1) * 12 + semitone;

          const step = Math.round((noteStartTick / divisions) * 4);
          const length = Math.max(1, Math.round((durationTicks / divisions) * 4));

          maxEndStep = Math.max(maxEndStep, step + length);

          const isBassClef = measure.querySelector("clef sign")?.textContent === "F";
          const type = isBassClef || midi < 50 || partIdx > 0 ? "bass" : "melody";

          parsedNotes.push({
            id: `xml_${noteIdCounter++}`,
            step,
            midi,
            length,
            type,
          });
        }

        partTimeTicks += measureTimeTicks;
      });
    });

    if (parsedNotes.length === 0) {
      throw new Error("No playable pitch notes found in this MusicXML file.");
    }

    const totalBars = Math.max(16, Math.ceil(maxEndStep / 16));

    return {
      format: "MusicXML",
      bpm: detectedBpm,
      bpmDetected: bpmFound,
      notes: parsedNotes,
      totalBars,
    };
  }
}

if (typeof window !== "undefined") {
  window.MusicImporter = MusicImporter;
}
if (typeof globalThis !== "undefined") {
  globalThis.MusicImporter = MusicImporter;
}
