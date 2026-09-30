// Local leaderboard: every finished run (win or loss) saved to localStorage, ranked by several stats.
const KEY = 'ltn-scores', MAX = 100;

export const BOARDS = [
  { id: 'score', title: 'Top Score', col: 'Score', value: (r) => r.score, fmt: (v) => v.toLocaleString() },
  { id: 'fastest', title: 'Fastest Victory', col: 'Time', value: (r) => (r.victory ? -r.time : null), fmt: (v) => fmtTime(-v) },
  { id: 'supplies', title: 'Most Supplies', col: 'Supplies', value: (r) => r.supplies, fmt: (v) => v },
  { id: 'kills', title: 'Most Kills', col: 'Kills', value: (r) => r.kills, fmt: (v) => v },
  { id: 'distance', title: 'Longest Journey', col: 'Distance', value: (r) => r.distance, fmt: (v) => `${(v / 1000).toFixed(2)} km` },
];

export function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

export function loadRuns() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Saves a run; returns its id and the boards where it placed in the top 10.
export function saveRun(run) {
  const runs = loadRuns();
  run.id = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  runs.push(run);
  // Keep the most valuable history if it grows too large.
  runs.sort((a, b) => b.score - a.score);
  const kept = runs.slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch (e) { console.warn('Could not save leaderboard:', e); }
  const placed = [];
  for (const b of BOARDS) {
    const rank = ranked(b, kept).findIndex((r) => r.id === run.id);
    if (rank >= 0 && rank < 10) placed.push({ board: b, rank: rank + 1 });
  }
  return { id: run.id, placed };
}

export function ranked(board, runs = loadRuns()) {
  return runs.filter((r) => board.value(r) !== null && board.value(r) !== undefined)
    .sort((a, b) => board.value(b) - board.value(a) || a.time - b.time);
}

export function clearRuns() { localStorage.removeItem(KEY); }
