// ========================================================
// Web Audio API Sound Engine & Stereo Synthesizer
// ========================================================

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.masterGain = null;
  }

  init() {
    if (this.isInitialized && this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master Output Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  // Convert MIDI note number (e.g. 60 = C4) to frequency in Hz
  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Play a single note preview (e.g. clicking piano keys or grid)
  playPreview(midi, type = "melody") {
    this.ensureContext();
    this.triggerNote(midi, type, this.ctx.currentTime, 0.35);
  }

  // Trigger a note at an exact scheduled time (Clean single strike, NO duplicate delay)
  triggerNote(midi, type, startTime, duration = 0.5) {
    if (!this.ctx) return;
    const freq = this.midiToFreq(midi);

    if (type === "bass") {
      this.playBassNote(freq, startTime, duration);
    } else {
      this.playMelodyNote(freq, startTime, duration);
    }
  }

  // =========================================================================
  // Melody Synth (Green Notes)
  // Stereo Spread: Left ear gets primary warm sine + triangle,
  // Right ear gets subtle detuned harmonic companion for wide stereo width
  // without any duplicate trigger or delayed echo!
  // =========================================================================
  playMelodyNote(freq, time, duration) {
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const gainLeft = this.ctx.createGain();
    const gainRight = this.ctx.createGain();

    // Left channel: fundamental sine + warm tone
    oscLeft.type = "sine";
    oscLeft.frequency.setValueAtTime(freq, time);

    // Right channel: subtle 3-cent detune creating a lush stereo chorus feel
    oscRight.type = "triangle";
    oscRight.frequency.setValueAtTime(freq, time);
    oscRight.detune.setValueAtTime(4, time); // +4 cents detune for rich headphone dimension

    // Panning (if StereoPanner is supported in browser)
    if (this.ctx.createStereoPanner) {
      const pannerLeft = this.ctx.createStereoPanner();
      pannerLeft.pan.setValueAtTime(-0.45, time); // slightly to Left ear
      gainLeft.connect(pannerLeft);
      pannerLeft.connect(this.masterGain);

      const pannerRight = this.ctx.createStereoPanner();
      pannerRight.pan.setValueAtTime(0.45, time); // slightly to Right ear
      gainRight.connect(pannerRight);
      pannerRight.connect(this.masterGain);
    } else {
      gainLeft.connect(this.masterGain);
      gainRight.connect(this.masterGain);
    }

    oscLeft.connect(gainLeft);
    oscRight.connect(gainRight);

    // ADSR Pluck Envelope (Clean attack, smooth decay)
    const attack = 0.012; // 12ms quick smooth strike avoids clicks
    const decayDuration = Math.max(0.1, duration);

    // Left envelope
    gainLeft.gain.setValueAtTime(0.0001, time);
    gainLeft.gain.exponentialRampToValueAtTime(0.32, time + attack);
    gainLeft.gain.exponentialRampToValueAtTime(0.0001, time + decayDuration);

    // Right envelope
    gainRight.gain.setValueAtTime(0.0001, time);
    gainRight.gain.exponentialRampToValueAtTime(0.18, time + attack);
    gainRight.gain.exponentialRampToValueAtTime(0.0001, time + decayDuration);

    oscLeft.start(time);
    oscRight.start(time);
    oscLeft.stop(time + decayDuration + 0.05);
    oscRight.stop(time + decayDuration + 0.05);
  }

  // =========================================================================
  // Bass Synth (Purple Notes)
  // Deep, warm low-end with lowpass filter for punch and clarity
  // Sits centered with solid foundation
  // =========================================================================
  playBassNote(freq, time, duration) {
    const oscSub = this.ctx.createOscillator();
    const oscBody = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const noteGain = this.ctx.createGain();

    // Sub sine fundamental
    oscSub.type = "sine";
    oscSub.frequency.setValueAtTime(freq, time);

    // Triangle body
    oscBody.type = "triangle";
    oscBody.frequency.setValueAtTime(freq, time);

    // Warm low-pass filter
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(350, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + duration);

    oscSub.connect(filter);
    oscBody.connect(filter);
    filter.connect(noteGain);

    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(0.0, time); // centered bass
      noteGain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      noteGain.connect(this.masterGain);
    }

    const attack = 0.01;
    const decayDuration = Math.max(0.1, duration);

    noteGain.gain.setValueAtTime(0.0001, time);
    noteGain.gain.exponentialRampToValueAtTime(0.5, time + attack);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, time + decayDuration);

    oscSub.start(time);
    oscBody.start(time);
    oscSub.stop(time + decayDuration + 0.05);
    oscBody.stop(time + decayDuration + 0.05);
  }

  // Export current composition to clean Stereo WAV (No delay duplication)
  exportToWav(notes, bpm, totalBars = 16) {
    const sampleRate = 44100;
    const secondsPerBeat = 60 / bpm;
    const secondsPerStep = secondsPerBeat / 4; // 16th notes
    const songDuration = Math.max(8, totalBars * 4 * secondsPerBeat + 2);
    const totalSamples = Math.floor(sampleRate * songDuration);

    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    notes.forEach((note) => {
      const freq = this.midiToFreq(note.midi);
      const startTime = note.step * secondsPerStep;
      const duration = note.length * secondsPerStep;
      const startSample = Math.floor(startTime * sampleRate);
      const noteSamples = Math.floor(duration * sampleRate);

      const isBass = note.type === "bass";
      const volume = isBass ? 0.45 : 0.32;

      // Stereo differentiation:
      // Bass is centered (equal in L and R)
      // Melody has subtle stereo separation (Left has fundamental, Right has detuned warmth)
      const attackSamples = Math.floor(0.012 * sampleRate);

      for (let i = 0; i < noteSamples; i++) {
        const idx = startSample + i;
        if (idx >= totalSamples) break;
        const t = i / sampleRate;
        const progress = i / noteSamples;

        const env = i < attackSamples ? i / attackSamples : Math.exp(-progress * 4.2);

        if (isBass) {
          const wave = Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
          const s = wave * env * volume;
          left[idx] += s;
          right[idx] += s;
        } else {
          // Left ear gets fundamental
          const waveLeft = Math.sin(2 * Math.PI * freq * t) * 0.75 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.25;
          // Right ear gets slightly detuned harmonic for stereo width
          const detunedFreq = freq * Math.pow(2, 4 / 1200); // +4 cents
          const waveRight = Math.sin(2 * Math.PI * detunedFreq * t) * 0.7 + Math.sin(2 * Math.PI * detunedFreq * 2 * t) * 0.3;

          left[idx] += waveLeft * env * (volume * 0.85);
          right[idx] += waveRight * env * (volume * 0.65);
        }
      }
    });

    const wavBuffer = this.buildWavBuffer(sampleRate, left, right);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piano_roll_song_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  buildWavBuffer(sampleRate, leftChannel, rightChannel) {
    const numSamples = leftChannel.length;
    const numChannels = 2;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const l = Math.max(-1, Math.min(1, leftChannel[i]));
      const r = Math.max(-1, Math.min(1, rightChannel[i]));
      view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
      view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
      offset += 4;
    }

    return buffer;
  }
}

window.soundEngine = new SoundEngine();
