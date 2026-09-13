// ========================================================
// Mini DAW • Piano Roll Interactive Controller
// ========================================================

const CONFIG = {
  totalBars: 16,
  beatsPerBar: 4,
  stepsPerBeat: 4, // 16th notes
  get totalSteps() {
    return this.totalBars * this.beatsPerBar * this.stepsPerBeat;
  },
  minMidi: 36, // C2
  maxMidi: 84, // C6
  stepWidth: 22, // width of one 16th note
  rowHeight: 18, // height of one semitone row
  keyWidth: 64,
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEYS = [false, true, false, true, false, false, true, false, true, false, true, false];

class PianoRollApp {
  constructor() {
    this.notes = [];
    this.bpm = 110;
    this.isPlaying = false;
    this.isLooping = true;
    this.currentStep = 0;
    this.currentTrack = "melody"; // 'melody' or 'bass'
    this.playbackTimer = null;
    this.draggedNote = null;
    this.dragAction = null; // 'move' or 'resize'
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialNoteState = null;

    this.initDOM();
    this.initPianoKeys();
    this.resizeGrid();
    this.bindEvents();
    this.bindDragAndDrop();
    this.loadDemoSong(); // Auto load demo pattern from screenshot
  }

  initDOM() {
    this.gridScroll = document.getElementById("gridScrollContainer");
    this.rulerScroll = document.getElementById("rulerScrollContainer");
    this.keysScroll = document.getElementById("keysScrollContainer");
    this.pianoKeysContainer = document.getElementById("pianoKeys");
    this.gridLayer = document.getElementById("gridLayer");
    this.gridCanvas = document.getElementById("gridCanvas");
    this.rulerCanvas = document.getElementById("rulerCanvas");
    this.notesContainer = document.getElementById("notesContainer");
    this.playhead = document.getElementById("playhead");

    this.btnPlay = document.getElementById("btnPlay");
    this.btnStop = document.getElementById("btnStop");
    this.btnLoop = document.getElementById("btnLoop");
    this.tempoInput = document.getElementById("tempoInput");
    this.tempoSlider = document.getElementById("tempoSlider");
    this.btnSelectMelody = document.getElementById("btnSelectMelody");
    this.btnSelectBass = document.getElementById("btnSelectBass");
    this.btnLoadDemo = document.getElementById("btnLoadDemo");
    this.btnLoadBaaBaa = document.getElementById("btnLoadBaaBaa");
    this.btnClear = document.getElementById("btnClear");
    this.btnExportWav = document.getElementById("btnExportWav");
    this.btnExportMidi = document.getElementById("btnExportMidi");
    this.btnExportSheet = document.getElementById("btnExportSheet");
    this.btnImport = document.getElementById("btnImport");
    this.fileInput = document.getElementById("fileInput");
    this.dropOverlay = document.getElementById("dropOverlay");

    // Scroll to comfortable middle octave (C4)
    setTimeout(() => {
      const midMidi = 60; // C4
      const row = CONFIG.maxMidi - midMidi;
      const targetScroll = row * CONFIG.rowHeight - 150;
      this.gridScroll.scrollTop = targetScroll;
    }, 100);
  }

  // Recalculate grid dimensions (handles songs with more bars)
  resizeGrid() {
    this.totalRows = CONFIG.maxMidi - CONFIG.minMidi + 1;
    this.gridWidth = CONFIG.totalSteps * CONFIG.stepWidth;
    this.gridHeight = this.totalRows * CONFIG.rowHeight;

    this.gridLayer.style.width = `${this.gridWidth}px`;
    this.gridLayer.style.height = `${this.gridHeight}px`;
    this.gridCanvas.width = this.gridWidth;
    this.gridCanvas.height = this.gridHeight;

    this.rulerCanvas.width = this.gridWidth;
    this.rulerCanvas.height = 28;

    this.initGridCanvas();
    this.initRuler();
    this.renderNotes();
  }

  // Draw Piano Keys on the Left Sidebar
  initPianoKeys() {
    this.pianoKeysContainer.innerHTML = "";
    const totalRows = CONFIG.maxMidi - CONFIG.minMidi + 1;
    this.pianoKeysContainer.style.height = `${totalRows * CONFIG.rowHeight}px`;

    for (let midi = CONFIG.maxMidi; midi >= CONFIG.minMidi; midi--) {
      const semitone = midi % 12;
      const octave = Math.floor(midi / 12) - 1;
      const isBlack = BLACK_KEYS[semitone];
      const rowIndex = CONFIG.maxMidi - midi;

      const keyEl = document.createElement("div");
      keyEl.className = `piano-key ${isBlack ? "black" : "white"}`;
      keyEl.style.top = `${rowIndex * CONFIG.rowHeight}px`;
      keyEl.style.height = `${CONFIG.rowHeight}px`;

      // Show label on C notes (C2, C3, C4, C5, C6) like in screenshot
      if (semitone === 0) {
        keyEl.textContent = `C${octave}`;
      }

      keyEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        window.soundEngine.playPreview(midi, this.currentTrack);
        keyEl.classList.add("active");
      });

      window.addEventListener("mouseup", () => {
        keyEl.classList.remove("active");
      });

      this.pianoKeysContainer.appendChild(keyEl);
    }
  }

  // Draw Grid lines & background
  initGridCanvas() {
    const ctx = this.gridCanvas.getContext("2d");
    ctx.clearRect(0, 0, this.gridWidth, this.gridHeight);

    // 1. Horizontal row backgrounds
    for (let midi = CONFIG.maxMidi; midi >= CONFIG.minMidi; midi--) {
      const semitone = midi % 12;
      const isBlack = BLACK_KEYS[semitone];
      const y = (CONFIG.maxMidi - midi) * CONFIG.rowHeight;

      ctx.fillStyle = isBlack ? "#1b1d22" : "#23262d";
      ctx.fillRect(0, y, this.gridWidth, CONFIG.rowHeight);

      // Row separator
      ctx.strokeStyle = "#2d313a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + CONFIG.rowHeight);
      ctx.lineTo(this.gridWidth, y + CONFIG.rowHeight);
      ctx.stroke();
    }

    // 2. Vertical grid columns (bars, beats, 16ths)
    for (let step = 0; step <= CONFIG.totalSteps; step++) {
      const x = step * CONFIG.stepWidth;
      const isBar = step % (CONFIG.beatsPerBar * CONFIG.stepsPerBeat) === 0;
      const isBeat = step % CONFIG.stepsPerBeat === 0;

      ctx.beginPath();
      if (isBar) {
        ctx.strokeStyle = "#4e5563";
        ctx.lineWidth = 1.5;
      } else if (isBeat) {
        ctx.strokeStyle = "#343842";
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = "#252830";
        ctx.lineWidth = 0.7;
      }
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.gridHeight);
      ctx.stroke();
    }
  }

  // Draw Top Bar Ruler (1, 2, 3, 4, ... 16)
  initRuler() {
    const ctx = this.rulerCanvas.getContext("2d");
    ctx.clearRect(0, 0, this.gridWidth, 28);

    ctx.fillStyle = "#cca038"; // Amber gold header
    ctx.fillRect(0, 0, this.gridWidth, 28);

    ctx.font = "bold 11px Inter, sans-serif";
    ctx.fillStyle = "#1e1a12";

    const stepsPerBar = CONFIG.beatsPerBar * CONFIG.stepsPerBeat;
    for (let bar = 0; bar < CONFIG.totalBars; bar++) {
      const x = bar * stepsPerBar * CONFIG.stepWidth;

      // Bar number text
      ctx.fillText(`${bar + 1}`, x + 6, 18);

      // Bar marker tick
      ctx.fillStyle = "#1e1a12";
      ctx.fillRect(x, 0, 1.5, 28);

      // Beat marker ticks
      for (let beat = 1; beat < CONFIG.beatsPerBar; beat++) {
        const beatX = x + beat * CONFIG.stepsPerBeat * CONFIG.stepWidth;
        ctx.fillStyle = "#917126";
        ctx.fillRect(beatX, 14, 1, 14);
      }
    }
  }

  // Bind all UI & Mouse Events
  bindEvents() {
    // Synchronize scrolling
    this.gridScroll.addEventListener("scroll", () => {
      this.rulerScroll.scrollLeft = this.gridScroll.scrollLeft;
      this.keysScroll.scrollTop = this.gridScroll.scrollTop;
    });

    // Transport buttons
    this.btnPlay.addEventListener("click", () => this.togglePlay());
    this.btnStop.addEventListener("click", () => this.stop());
    this.btnLoop.addEventListener("click", () => {
      this.isLooping = !this.isLooping;
      this.btnLoop.classList.toggle("active", this.isLooping);
    });

    // Tempo controls
    const setBpm = (val) => {
      this.bpm = Math.max(20, Math.min(320, parseInt(val, 10) || 110));
      this.tempoInput.value = this.bpm;
      this.tempoSlider.value = this.bpm;
    };
    this.tempoInput.addEventListener("change", (e) => setBpm(e.target.value));
    this.tempoSlider.addEventListener("input", (e) => setBpm(e.target.value));

    // Track selector (Melody vs Bass)
    this.btnSelectMelody.addEventListener("click", () => {
      this.currentTrack = "melody";
      this.btnSelectMelody.classList.add("active");
      this.btnSelectBass.classList.remove("active");
    });
    this.btnSelectBass.addEventListener("click", () => {
      this.currentTrack = "bass";
      this.btnSelectBass.classList.add("active");
      this.btnSelectMelody.classList.remove("active");
    });

    // File Import Button & Input
    if (this.btnImport && this.fileInput) {
      this.btnImport.addEventListener("click", () => this.fileInput.click());
      this.fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.handleImportFile(file);
          this.fileInput.value = "";
        }
      });
    }

    // Quick actions
    this.btnLoadDemo.addEventListener("click", () => this.loadDemoSong());
    this.btnClear.addEventListener("click", () => {
      if (confirm("Clear all notes?")) {
        this.notes = [];
        this.renderNotes();
      }
    });
    this.btnExportWav.addEventListener("click", () => {
      if (this.notes.length === 0) {
        alert("Please place some notes on the grid first!");
        return;
      }
      window.soundEngine.exportToWav(this.notes, this.bpm, CONFIG.totalBars);
    });

    if (this.btnExportMidi) {
      this.btnExportMidi.addEventListener("click", () => {
        if (window.MidiExporter) {
          window.MidiExporter.exportNotes(this.notes, this.bpm);
        }
      });
    }

    if (this.btnExportSheet) {
      this.btnExportSheet.addEventListener("click", () => {
        if (window.SheetMusicExporter) {
          window.SheetMusicExporter.exportToExcalidrawMd(this.notes, {
            title: "🎵 Piano Roll Score",
            bpm: this.bpm,
          });
        }
      });
    }

    if (this.btnLoadBaaBaa) {
      this.btnLoadBaaBaa.addEventListener("click", () => {
        this.loadBaaBaaSong();
      });
    }

    // Spacebar to toggle Play/Pause
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT") {
        e.preventDefault();
        this.togglePlay();
      }
    });

    // Click Ruler to set playhead
    this.rulerCanvas.addEventListener("mousedown", (e) => {
      const rect = this.rulerCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const step = Math.floor(clickX / CONFIG.stepWidth);
      this.setPlayheadStep(step);
    });

    // Grid interaction (Add note, Drag note, Resize note)
    this.gridLayer.addEventListener("mousedown", (e) => this.handleGridMouseDown(e));
    window.addEventListener("mousemove", (e) => this.handleWindowMouseMove(e));
    window.addEventListener("mouseup", () => this.handleWindowMouseUp());
  }

  // Drag and Drop Music files (.mid, .midi, .musicxml, .xml) onto the browser
  bindDragAndDrop() {
    let dragCounter = 0;

    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      if (this.dropOverlay) this.dropOverlay.classList.add("active");
    });

    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && this.dropOverlay) {
        this.dropOverlay.classList.remove("active");
        dragCounter = 0;
      }
    });

    window.addEventListener("dragover", (e) => e.preventDefault());

    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (this.dropOverlay) this.dropOverlay.classList.remove("active");

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        await this.handleImportFile(files[0]);
      }
    });
  }

  // Process an imported file (MIDI or MusicXML)
  // Process an imported file (MIDI or MusicXML)
  async handleImportFile(file) {
    try {
      window.soundEngine.ensureContext();
      const result = await window.MusicImporter.importFile(file);

      // Adjust total bars if song is longer than 16 bars
      CONFIG.totalBars = Math.max(16, result.totalBars);

      // Set BPM detected from MIDI / MusicXML
      if (result.bpm) {
        this.bpm = result.bpm;
        if (this.tempoInput) {
          this.tempoInput.min = Math.min(20, this.bpm);
          this.tempoInput.max = Math.max(300, this.bpm);
          this.tempoInput.value = this.bpm;
        }
        if (this.tempoSlider) {
          this.tempoSlider.min = Math.min(20, this.bpm);
          this.tempoSlider.max = Math.max(300, this.bpm);
          this.tempoSlider.value = this.bpm;
        }
      }

      this.notes = result.notes;
      this.resizeGrid();
      this.stop();

      // Scroll to average pitch of imported notes
      if (this.notes.length > 0) {
        const avgMidi = Math.round(this.notes.reduce((sum, n) => sum + n.midi, 0) / this.notes.length);
        const row = CONFIG.maxMidi - avgMidi;
        this.gridScroll.scrollTop = row * CONFIG.rowHeight - 150;
        this.gridScroll.scrollLeft = 0;
      }

      const tempoMsg = result.bpmDetected ? `⏱ Detected & set tempo: ${result.bpm} BPM` : `⏱ Set tempo: ${result.bpm} BPM`;

      alert(`✔ Successfully imported ${result.notes.length} notes from "${file.name}" (${result.format})!\n${tempoMsg}`);
    } catch (err) {
      console.error("Import error:", err);
      alert("Error importing file: " + err.message);
    }
  }

  // Handle Note Placement and Interactions
  handleGridMouseDown(e) {
    if (e.button === 2) return; // Right click handled separately
    const rect = this.gridLayer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked directly on an existing note
    const noteEl = e.target.closest(".note-block");
    if (noteEl) {
      const noteId = noteEl.dataset.id;
      const note = this.notes.find((n) => n.id === noteId);
      if (!note) return;

      if (e.target.classList.contains("note-resize-handle")) {
        this.dragAction = "resize";
      } else {
        this.dragAction = "move";
        window.soundEngine.playPreview(note.midi, note.type);
      }

      this.draggedNote = note;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.initialNoteState = { ...note };
      return;
    }

    // Otherwise, click on empty cell: Add new note!
    const step = Math.floor(x / CONFIG.stepWidth);
    const rowIndex = Math.floor(y / CONFIG.rowHeight);
    const midi = CONFIG.maxMidi - rowIndex;

    if (step >= 0 && step < CONFIG.totalSteps && midi >= CONFIG.minMidi && midi <= CONFIG.maxMidi) {
      const newNote = {
        id: "n_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        step: step,
        midi: midi,
        length: 4,
        type: this.currentTrack,
      };
      this.notes.push(newNote);
      this.renderNotes();
      window.soundEngine.playPreview(midi, this.currentTrack);
    }
  }

  handleWindowMouseMove(e) {
    if (!this.draggedNote || !this.dragAction) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;
    const stepDelta = Math.round(deltaX / CONFIG.stepWidth);
    const rowDelta = Math.round(deltaY / CONFIG.rowHeight);

    if (this.dragAction === "move") {
      let newStep = this.initialNoteState.step + stepDelta;
      newStep = Math.max(0, Math.min(CONFIG.totalSteps - this.draggedNote.length, newStep));

      let newMidi = this.initialNoteState.midi - rowDelta;
      newMidi = Math.max(CONFIG.minMidi, Math.min(CONFIG.maxMidi, newMidi));

      this.draggedNote.step = newStep;
      this.draggedNote.midi = newMidi;
      this.updateNoteElement(this.draggedNote);
    } else if (this.dragAction === "resize") {
      let newLength = this.initialNoteState.length + stepDelta;
      newLength = Math.max(1, Math.min(CONFIG.totalSteps - this.draggedNote.step, newLength));

      this.draggedNote.length = newLength;
      this.updateNoteElement(this.draggedNote);
    }
  }

  handleWindowMouseUp() {
    if (this.draggedNote) {
      this.draggedNote = null;
      this.dragAction = null;
      this.initialNoteState = null;
    }
  }

  // Render all note blocks
  renderNotes() {
    this.notesContainer.innerHTML = "";
    this.notes.forEach((note) => {
      const el = document.createElement("div");
      el.className = `note-block ${note.type}`;
      el.dataset.id = note.id;

      // Inner sustain bar (like in screenshot)
      const sustain = document.createElement("div");
      sustain.className = "note-sustain-line";
      el.appendChild(sustain);

      // Right edge resize handle
      const handle = document.createElement("div");
      handle.className = "note-resize-handle";
      el.appendChild(handle);

      // Right-click or double-click to delete
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.deleteNote(note.id);
      });
      el.addEventListener("dblclick", () => {
        this.deleteNote(note.id);
      });

      this.positionNoteElement(el, note);
      this.notesContainer.appendChild(el);
    });
  }

  positionNoteElement(el, note) {
    const x = note.step * CONFIG.stepWidth;
    const y = (CONFIG.maxMidi - note.midi) * CONFIG.rowHeight;
    const w = note.length * CONFIG.stepWidth - 1;
    const h = CONFIG.rowHeight - 1;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  updateNoteElement(note) {
    const el = this.notesContainer.querySelector(`[data-id="${note.id}"]`);
    if (el) {
      this.positionNoteElement(el, note);
    }
  }

  deleteNote(id) {
    this.notes = this.notes.filter((n) => n.id !== id);
    this.renderNotes();
  }

  // Playhead & Transport Logic
  setPlayheadStep(step) {
    this.currentStep = step % CONFIG.totalSteps;
    const x = this.currentStep * CONFIG.stepWidth;
    this.playhead.style.left = `${x}px`;
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    window.soundEngine.ensureContext();
    this.isPlaying = true;
    this.btnPlay.innerHTML = '<span class="icon">⏸</span> Pause';
    this.btnPlay.classList.add("playing");

    const stepIntervalMs = (60 / this.bpm / CONFIG.stepsPerBeat) * 1000;
    let nextTickTime = performance.now();

    const loop = (currentTime) => {
      if (!this.isPlaying) return;

      while (currentTime >= nextTickTime) {
        this.triggerStepNotes(this.currentStep);

        // Advance playhead
        this.setPlayheadStep(this.currentStep);
        this.currentStep++;

        if (this.currentStep >= CONFIG.totalSteps) {
          if (this.isLooping) {
            this.currentStep = 0;
          } else {
            this.stop();
            return;
          }
        }
        nextTickTime += (60 / this.bpm / CONFIG.stepsPerBeat) * 1000;
      }

      this.playbackTimer = requestAnimationFrame(loop);
    };

    this.playbackTimer = requestAnimationFrame(loop);
  }

  pause() {
    this.isPlaying = false;
    if (this.playbackTimer) cancelAnimationFrame(this.playbackTimer);
    this.btnPlay.innerHTML = '<span class="icon">▶</span> Play';
    this.btnPlay.classList.remove("playing");
  }

  stop() {
    this.pause();
    this.setPlayheadStep(0);
  }

  triggerStepNotes(step) {
    // Find all notes starting at this step
    const activeNotes = this.notes.filter((n) => n.step === step);
    const secondsPerStep = 60 / this.bpm / CONFIG.stepsPerBeat;

    activeNotes.forEach((note) => {
      const dur = note.length * secondsPerStep;
      window.soundEngine.triggerNote(note.midi, note.type, window.soundEngine.ctx.currentTime, dur);

      // Flash note visual effect
      const el = this.notesContainer.querySelector(`[data-id="${note.id}"]`);
      if (el) {
        el.classList.add("playing");
        setTimeout(() => el.classList.remove("playing"), Math.min(300, dur * 1000));
      }
    });
  }

  // Load the Demo pattern recreating the arrangement in videoframe_73167.png!
  loadDemoSong() {
    CONFIG.totalBars = 16;
    this.notes = [];
    let idCounter = 1;
    const addN = (step, noteStr, length, type) => {
      const match = noteStr.match(/^([A-G][#b]?)([0-8])$/);
      if (!match) return;
      const semitones = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
      const midi = (parseInt(match[2], 10) + 1) * 12 + semitones[match[1]];
      this.notes.push({
        id: `demo_${idCounter++}`,
        step,
        midi,
        length,
        type,
      });
    };

    // Bars 1-16 Arrangement directly inspired by the screenshot:
    // Purple Bass notes (low register C2, E2, F2, G2, A2)
    const bassRhythm = [
      // Bar 1 - 2
      { step: 0, note: "A2", len: 2 },
      { step: 3, note: "A2", len: 2 },
      { step: 6, note: "A2", len: 2 },
      { step: 9, note: "A2", len: 2 },
      { step: 16, note: "E2", len: 2 },
      { step: 19, note: "E2", len: 2 },
      { step: 22, note: "E2", len: 2 },
      { step: 25, note: "E2", len: 2 },
      { step: 28, note: "E2", len: 2 },

      // Bar 3 - 4 (Deep C2 hit like in screenshot bar 2-3!)
      { step: 30, note: "C2", len: 3 },
      { step: 34, note: "C2", len: 3 },
      { step: 44, note: "A2", len: 2 },
      { step: 47, note: "A2", len: 2 },
      { step: 50, note: "A2", len: 2 },
      { step: 53, note: "A2", len: 2 },

      // Bar 5 - 8 (Walking bass groove)
      { step: 58, note: "D2", len: 3 },
      { step: 62, note: "D2", len: 3 },
      { step: 68, note: "C2", len: 3 },
      { step: 72, note: "C2", len: 3 },
      { step: 76, note: "C2", len: 3 },
      { step: 80, note: "C2", len: 3 },

      // Bar 9 - 12
      { step: 86, note: "F2", len: 2 },
      { step: 89, note: "F2", len: 2 },
      { step: 92, note: "F2", len: 2 },
      { step: 95, note: "F2", len: 2 },
      { step: 98, note: "F2", len: 2 },
      { step: 101, note: "F2", len: 2 },
      { step: 104, note: "F2", len: 2 },

      // Bar 13 - 16
      { step: 114, note: "C2", len: 3 },
      { step: 118, note: "C2", len: 3 },
      { step: 124, note: "G2", len: 2 },
      { step: 127, note: "G2", len: 2 },
      { step: 130, note: "G2", len: 2 },
      { step: 133, note: "G2", len: 2 },
      { step: 136, note: "G2", len: 2 },
      { step: 139, note: "G2", len: 2 },
    ];

    bassRhythm.forEach((b) => addN(b.step, b.note, b.len, "bass"));

    // Green Melody notes (rich polyphonic hook matching screenshot bars 1-16)
    const melodyNotes = [
      // Bar 1 - 2
      { step: 2, note: "C3", len: 3 },
      { step: 6, note: "C3", len: 8 },
      { step: 10, note: "D3", len: 6 },
      { step: 16, note: "E3", len: 4 },
      { step: 21, note: "D3", len: 6 },
      { step: 28, note: "C3", len: 8 },
      { step: 32, note: "E3", len: 6 },
      { step: 38, note: "G3", len: 4 },
      { step: 42, note: "E3", len: 4 },
      { step: 47, note: "C4", len: 4 },

      // Bar 4 - 6
      { step: 52, note: "E3", len: 6 },
      { step: 58, note: "G3", len: 4 },
      { step: 63, note: "A3", len: 4 },
      { step: 68, note: "C4", len: 8 },
      { step: 76, note: "B3", len: 6 },
      { step: 82, note: "G3", len: 6 },

      // Bar 7 - 10 (Rising climax in C4 - G4)
      { step: 88, note: "C4", len: 6 },
      { step: 94, note: "D4", len: 6 },
      { step: 100, note: "E4", len: 12 },
      { step: 108, note: "G4", len: 10 },
      { step: 118, note: "E4", len: 12 },
      { step: 126, note: "D4", len: 4 },

      // Bar 11 - 16
      { step: 132, note: "C4", len: 6 },
      { step: 138, note: "B3", len: 4 },
      { step: 142, note: "A3", len: 4 },
      { step: 148, note: "G3", len: 10 },
      { step: 156, note: "A3", len: 4 },
      { step: 160, note: "C4", len: 12 },
      { step: 172, note: "B3", len: 8 },
      { step: 180, note: "C4", len: 12 },
    ];

    melodyNotes.forEach((m) => addN(m.step, m.note, m.len, "melody"));

    this.resizeGrid();
  }

  // Load Baa Baa Black Sheep melody & bass
  loadBaaBaaSong() {
    CONFIG.totalBars = 16;
    this.bpm = 110;
    this.tempoInput.value = this.bpm;
    this.tempoSlider.value = this.bpm;
    this.notes = [];
    let idCounter = 1;

    const addN = (step, midi, length, type, text) => {
      this.notes.push({
        id: `baa_${idCounter++}`,
        step,
        midi,
        length,
        type,
        text,
      });
    };

    // Melody
    const melody = [
      { step: 0, midi: 60, len: 4, text: "Baa," },
      { step: 4, midi: 60, len: 4, text: "baa," },
      { step: 8, midi: 67, len: 4, text: "black" },
      { step: 12, midi: 67, len: 4, text: "sheep," },
      { step: 16, midi: 69, len: 4, text: "have" },
      { step: 20, midi: 69, len: 4, text: "you" },
      { step: 24, midi: 67, len: 8, text: "wool?" },
      { step: 32, midi: 65, len: 4, text: "Yes," },
      { step: 36, midi: 65, len: 4, text: "sir," },
      { step: 40, midi: 64, len: 4, text: "yes," },
      { step: 44, midi: 64, len: 4, text: "sir," },
      { step: 48, midi: 62, len: 4, text: "three" },
      { step: 52, midi: 62, len: 4, text: "bags" },
      { step: 56, midi: 60, len: 8, text: "full." },
      { step: 64, midi: 67, len: 4, text: "One" },
      { step: 68, midi: 67, len: 4, text: "for" },
      { step: 72, midi: 65, len: 4, text: "the" },
      { step: 76, midi: 65, len: 4, text: "mas-" },
      { step: 80, midi: 64, len: 4, text: "ter," },
      { step: 84, midi: 64, len: 4, text: "and" },
      { step: 88, midi: 62, len: 8, text: "dame," },
      { step: 96, midi: 67, len: 4, text: "And" },
      { step: 100, midi: 67, len: 4, text: "one" },
      { step: 104, midi: 65, len: 4, text: "for" },
      { step: 108, midi: 65, len: 4, text: "the" },
      { step: 112, midi: 64, len: 4, text: "lit-" },
      { step: 116, midi: 64, len: 4, text: "tle" },
      { step: 120, midi: 62, len: 8, text: "lane." },
      { step: 128, midi: 60, len: 4, text: "Baa," },
      { step: 132, midi: 60, len: 4, text: "baa," },
      { step: 136, midi: 67, len: 4, text: "black" },
      { step: 140, midi: 67, len: 4, text: "sheep," },
      { step: 144, midi: 69, len: 4, text: "have" },
      { step: 148, midi: 69, len: 4, text: "you" },
      { step: 152, midi: 67, len: 8, text: "wool?" },
      { step: 160, midi: 65, len: 4, text: "Yes," },
      { step: 164, midi: 65, len: 4, text: "sir," },
      { step: 168, midi: 64, len: 4, text: "yes," },
      { step: 172, midi: 64, len: 4, text: "sir," },
      { step: 176, midi: 62, len: 4, text: "three" },
      { step: 180, midi: 62, len: 4, text: "bags" },
      { step: 184, midi: 60, len: 8, text: "full." },
    ];
    melody.forEach((m) => addN(m.step, m.midi, m.len, "melody", m.text));

    // Bass Accompaniment
    const bass = [
      { step: 0, midi: 48, len: 8 },
      { step: 8, midi: 48, len: 8 },
      { step: 16, midi: 53, len: 8 },
      { step: 24, midi: 55, len: 8 },
      { step: 32, midi: 53, len: 8 },
      { step: 40, midi: 48, len: 8 },
      { step: 48, midi: 55, len: 8 },
      { step: 56, midi: 48, len: 8 },
      { step: 64, midi: 55, len: 8 },
      { step: 72, midi: 53, len: 8 },
      { step: 80, midi: 48, len: 8 },
      { step: 88, midi: 55, len: 8 },
      { step: 96, midi: 55, len: 8 },
      { step: 104, midi: 53, len: 8 },
      { step: 112, midi: 48, len: 8 },
      { step: 120, midi: 55, len: 8 },
      { step: 128, midi: 48, len: 8 },
      { step: 136, midi: 48, len: 8 },
      { step: 144, midi: 53, len: 8 },
      { step: 152, midi: 55, len: 8 },
      { step: 160, midi: 53, len: 8 },
      { step: 168, midi: 48, len: 8 },
      { step: 176, midi: 55, len: 8 },
      { step: 184, midi: 48, len: 8 },
    ];
    bass.forEach((b) => addN(b.step, b.midi, b.len, "bass"));

    this.resizeGrid();
    this.renderNotes();
  }
}

// Initialize Piano Roll App when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  window.app = new PianoRollApp();
});
