// Shared parser for chess.com atomic game dumps.
// Used by the upload API. Front-end has its own inline copy for import preview.

const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
const DEFAULT_USER = "w-a-s-u-k-e";

export function parseDate(s, now = new Date()) {
  const m = s.match(/([A-Za-z]{3})\s+(\d+)\s+(\d+):(\d+)\s*(AM|PM)/);
  if (!m) return null;
  let [, mon, d, h, mi, ap] = m;
  h = (parseInt(h) % 12) + (ap === "PM" ? 12 : 0);
  let dt = new Date(now.getFullYear(), MONTHS[mon], +d, h, +mi);
  if (dt > now) dt = new Date(dt.getFullYear() - 1, dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes());
  return dt;
}

function normScore(raw) {
  const s = raw.replace(/^[•\s]+/, "").replace(/\s+/g, "");
  if (s === "½-½" || s === "1/2-1/2") return "1/2-1/2";
  if (s === "1-0" || s === "0-1") return s;
  return null;
}

export function parseText(text, user = DEFAULT_USER, now = new Date()) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
    const lines = b.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 13) continue;
    let scoreIdx = lines.findIndex(l => normScore(l) !== null);
    if (scoreIdx < 0) scoreIdx = 6;
    try {
      const tc = lines[0];
      const variant = lines[1];
      const dateStr = lines[2];
      const dur = parseFloat(lines[3].replace(/^[•\s]+/, "").replace(/'$/, ""));
      const moves = parseInt(lines[4].replace(/^[•\s]+/, ""));
      const score = normScore(lines[scoreIdx]);
      if (!score) continue;

      const p1 = lines[scoreIdx+1];
      const r1 = parseInt(lines[scoreIdx+2].replace(/[()]/g,""));
      const c1 = parseFloat(lines[scoreIdx+3]);
      const p2 = lines[scoreIdx+4];
      const r2 = parseInt(lines[scoreIdx+5].replace(/[()]/g,""));
      const c2 = parseFloat(lines[scoreIdx+6]);

      const dt = parseDate(dateStr, now);
      if (!dt || !Number.isFinite(r1) || !Number.isFinite(r2)) continue;

      let result, winner;
      if (score === "1/2-1/2") { result = "draw"; winner = null; }
      else if (c1 > c2)        { winner = p1; result = p1 === user ? "win" : "loss"; }
      else                      { winner = p2; result = p2 === user ? "win" : "loss"; }

      let white = null;
      if (score === "1-0") white = winner;
      else if (score === "0-1") white = (winner === p1 ? p2 : p1);
      const black = white ? (white === p1 ? p2 : p1) : null;

      const isP1User = p1 === user;
      out.push({
        played_at:       dt.toISOString(),
        time_control:    tc,
        variant,
        duration_min:    Number.isFinite(dur) ? dur : null,
        moves:           Number.isFinite(moves) ? moves : null,
        score,
        user_name:       user,
        user_rating:     isP1User ? r1 : r2,
        user_change:     isP1User ? c1 : c2,
        user_color:      white === user ? "white" : black === user ? "black" : null,
        opponent_name:   isP1User ? p2 : p1,
        opponent_rating: isP1User ? r2 : r1,
        opponent_change: isP1User ? c2 : c1,
        result,
        winner_name:     winner,
        white_player:    white,
        black_player:    black,
      });
    } catch { /* skip malformed */ }
  }
  return out;
}
