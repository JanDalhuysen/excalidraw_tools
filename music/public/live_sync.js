// ========================================================
// Live Excalidraw Sync (client side)
// Connects to the server's SSE stream and applies edits made
// in Obsidian / Excalidraw to the piano roll in near real time.
// Also adds a "Live Sync" button that pushes the current notes
// to the watched live/ folder as an editable .excalidraw.md.
// ========================================================

(function () {
  const STATUS_ID = "liveSyncStatus";

  function notesEqual(a, b) {
    if (a.length !== b.length) return false;
    const key = (n) => `${n.step}|${n.midi}|${n.length}|${n.type}|${n.text || ""}`;
    const ka = a.map(key).sort();
    const kb = b.map(key).sort();
    return ka.every((k, i) => k === kb[i]);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: 9999,
      background: "#1f2937",
      color: "#e5e7eb",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "Inter, sans-serif",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      border: "1px solid #374151",
      opacity: "0",
      transition: "opacity 0.2s",
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => (toast.style.opacity = "1"));
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function applyScore(payload) {
    const app = window.app;
    if (!app) return;

    // Don't yank notes away while the user is dragging one; retry shortly
    if (app.draggedNote) {
      setTimeout(() => applyScore(payload), 400);
      return;
    }

    const incoming = payload.notes || [];
    if (notesEqual(app.notes, incoming)) return;

    const neededBars = Math.max(16, payload.totalBars || 16);
    if (CONFIG.totalBars !== neededBars) CONFIG.totalBars = neededBars;

    app.notes = incoming;
    app.resizeGrid();
    showToast(`🎼 Score updated from ${payload.file} (${incoming.length} notes)`);
  }

  function updateStatus(connected, detail) {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    const dot = el.querySelector(".live-dot");
    if (dot) dot.style.background = connected ? "#22c55e" : "#6b7280";
    el.title = detail || (connected ? "Live sync connected" : "Live sync disconnected — retrying…");
  }

  function connect() {
    const source = new EventSource("/api/live-events");
    source.onopen = () => updateStatus(true);
    source.onerror = () => updateStatus(false);
    source.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === "score") applyScore(payload);
      } catch (err) {
        console.error("[live-sync] Bad message", err);
      }
    };
  }

  async function pushScoreToServer() {
    const app = window.app;
    if (!app || !window.SheetMusicExporter) return;
    if (app.notes.length === 0) {
      alert("No notes to push! Add some notes on the piano roll first.");
      return;
    }
    const markdown = window.SheetMusicExporter.buildExcalidrawMd(app.notes, {
      title: "🎵 Piano Roll Score (Live Sync)",
      bpm: app.bpm,
    });
    if (!markdown) return;
    try {
      const res = await fetch("/api/live-score", { method: "POST", body: markdown });
      const data = await res.json();
      if (data.ok) {
        showToast("🔴 Live score saved — open live/score.excalidraw.md in Obsidian and edit it!");
      } else {
        alert("Live sync failed: " + (data.error || res.statusText));
      }
    } catch (err) {
      alert("Live sync failed: " + err.message);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    // Status badge in the hint bar
    const hints = document.querySelector(".hint-bar .hints");
    if (hints) {
      const badge = document.createElement("span");
      badge.id = STATUS_ID;
      badge.innerHTML = '<span class="live-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#6b7280;margin-right:5px;"></span>🎼 <strong>Live sync</strong>';
      hints.appendChild(badge);
    }

    // Push button in the header
    const headerRight = document.querySelector(".header-right");
    if (headerRight) {
      const btn = document.createElement("button");
      btn.id = "btnLiveSync";
      btn.className = "action-btn export-btn";
      btn.title = "Push current notes as a live-synced Excalidraw score (saved to the watched live/ folder, edits in Obsidian sync back here)";
      btn.textContent = "🔴 Live Sync";
      btn.addEventListener("click", pushScoreToServer);
      headerRight.insertBefore(btn, headerRight.firstChild);
    }

    connect();
  });
})();
