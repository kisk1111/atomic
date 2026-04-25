// POST /api/sync
// Pulls every atomic game from chess.com's public API for the configured user
// and inserts new ones into the games table.
//
// Auth: same UPLOAD_PASSWORD as /api/upload.
// Optional body { wipe: true } -> truncates the games table first.

import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

const sql = neon(process.env.DATABASE_URL);
const USER = process.env.CHESSCOM_USERNAME || "w-a-s-u-k-e";
const UA = "atomic-dashboard (vercel)";

function timingSafeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function pgnHeader(pgn, tag) {
  if (!pgn) return null;
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return m ? m[1] : null;
}

function fmtTimeControl(tc) {
  if (!tc) return null;
  // "180+2" -> "3 | 2"
  let m = String(tc).match(/^(\d+)\+(\d+)$/);
  if (m) {
    const min = parseInt(m[1]) / 60, inc = parseInt(m[2]);
    return `${Number.isInteger(min) ? min : min.toFixed(1)} | ${inc}`;
  }
  m = String(tc).match(/^(\d+)$/);
  if (m) {
    const min = parseInt(m[1]) / 60;
    return `${Number.isInteger(min) ? min : min.toFixed(1)} | 0`;
  }
  // daily games like "1/86400"
  return String(tc);
}

function durationMin(pgn) {
  const dStart = pgnHeader(pgn, "StartDate") || pgnHeader(pgn, "UTCDate");
  const tStart = pgnHeader(pgn, "StartTime") || pgnHeader(pgn, "UTCTime");
  const dEnd   = pgnHeader(pgn, "EndDate")   || dStart;
  const tEnd   = pgnHeader(pgn, "EndTime");
  if (!dStart || !tStart || !dEnd || !tEnd) return null;
  const start = new Date(`${dStart.replace(/\./g,"-")}T${tStart}Z`);
  const end   = new Date(`${dEnd.replace(/\./g,"-")}T${tEnd}Z`);
  if (isNaN(start) || isNaN(end)) return null;
  const sec = (end - start) / 1000;
  if (sec < 0 || sec > 24*3600) return null;
  return Math.round(sec / 60 * 10) / 10;
}

function parseGame(g) {
  if (g.rules !== "atomic") return null;
  const pgn = g.pgn;
  if (!pgn) return null;

  const userIsWhite = (g.white?.username || "").toLowerCase() === USER.toLowerCase();
  const userIsBlack = (g.black?.username || "").toLowerCase() === USER.toLowerCase();
  if (!userIsWhite && !userIsBlack) return null; // shouldn't happen but defensive

  const me  = userIsWhite ? g.white : g.black;
  const opp = userIsWhite ? g.black : g.white;

  let result, score;
  if (me.result === "win")            { result = "win";  score = userIsWhite ? "1-0" : "0-1"; }
  else if (opp.result === "win")      { result = "loss"; score = userIsWhite ? "0-1" : "1-0"; }
  else                                  { result = "draw"; score = "1/2-1/2"; }

  const winnerName = result === "win" ? me.username : result === "loss" ? opp.username : null;

  // chess.com end_time is unix seconds in UTC
  const playedAt = new Date(g.end_time * 1000).toISOString();

  const myDiff  = parseFloat(pgnHeader(pgn, userIsWhite ? "WhiteRatingDiff" : "BlackRatingDiff") || "0");
  const oppDiff = parseFloat(pgnHeader(pgn, userIsWhite ? "BlackRatingDiff" : "WhiteRatingDiff") || "0");
  const ply     = parseInt(pgnHeader(pgn, "PlyCount") || "0") || null;
  const moves   = ply ? Math.ceil(ply / 2) : null;
  const eco     = pgnHeader(pgn, "ECO");

  return {
    played_at:       playedAt,
    time_control:    fmtTimeControl(g.time_control),
    variant:         "Atomic",
    duration_min:    durationMin(pgn),
    moves,
    score,
    user_name:       USER,
    user_rating:     me.rating,
    user_change:     myDiff,
    user_color:      userIsWhite ? "white" : "black",
    opponent_name:   opp.username,
    opponent_rating: opp.rating,
    opponent_change: oppDiff,
    result,
    winner_name:     winnerName,
    white_player:    g.white.username,
    black_player:    g.black.username,
    pgn,
    chesscom_url:    g.url || null,
    time_class:      g.time_class || null,
    rated:           !!g.rated,
    eco,
    source:          "chesscom_api",
  };
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const expected = process.env.UPLOAD_PASSWORD;
  if (!expected) return res.status(500).json({ error: "server missing UPLOAD_PASSWORD" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { password, wipe } = body || {};
  if (!timingSafeEqual(password || "", expected)) {
    return res.status(401).json({ error: "bad password" });
  }

  try {
    if (wipe) {
      await sql`TRUNCATE TABLE games RESTART IDENTITY`;
    }

    const archives = await fetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(USER)}/games/archives`);
    const urls = archives.archives || [];

    let totalGames = 0, atomicCount = 0, inserted = 0, skipped = 0, errors = 0;
    const rulesSeen = {};
    const sampleAtomicLike = [];

    for (const url of urls) {
      let archive;
      try { archive = await fetchJson(url); }
      catch (e) { errors++; continue; }
      const games = archive.games || [];
      totalGames += games.length;

      for (const raw of games) {
        const r = raw.rules || "(missing)";
        rulesSeen[r] = (rulesSeen[r] || 0) + 1;
        // Capture a few non-standard games verbatim so we can see the shape.
        if (r !== "chess" && sampleAtomicLike.length < 3) {
          sampleAtomicLike.push({
            rules: raw.rules,
            time_class: raw.time_class,
            url: raw.url,
            end_time: raw.end_time,
          });
        }

        const g = parseGame(raw);
        if (!g) continue;
        atomicCount++;
        try {
          // Try insert; conflict on either played_at or chesscom_url is a skip.
          const r = await sql`
            INSERT INTO games (
              played_at, time_control, variant, duration_min, moves, score,
              user_name, user_rating, user_change, user_color,
              opponent_name, opponent_rating, opponent_change,
              result, winner_name, white_player, black_player,
              pgn, chesscom_url, time_class, rated, eco, source
            ) VALUES (
              ${g.played_at}, ${g.time_control}, ${g.variant}, ${g.duration_min}, ${g.moves}, ${g.score},
              ${g.user_name}, ${g.user_rating}, ${g.user_change}, ${g.user_color},
              ${g.opponent_name}, ${g.opponent_rating}, ${g.opponent_change},
              ${g.result}, ${g.winner_name}, ${g.white_player}, ${g.black_player},
              ${g.pgn}, ${g.chesscom_url}, ${g.time_class}, ${g.rated}, ${g.eco}, ${g.source}
            )
            ON CONFLICT (played_at) DO NOTHING
            RETURNING id
          `;
          if (r.length) inserted++;
          else skipped++;
        } catch (e) {
          errors++;
          // Likely chesscom_url unique conflict — also a skip
          if (String(e.message || "").includes("chesscom_url")) skipped++;
        }
      }
    }

    return res.status(200).json({
      user: USER,
      archives: urls.length,
      total_games: totalGames,
      atomic_games: atomicCount,
      inserted,
      skipped,
      errors,
      rules_seen: rulesSeen,
      sample_non_standard: sampleAtomicLike,
    });
  } catch (e) {
    console.error("sync failed", e);
    return res.status(500).json({ error: "sync failed: " + (e.message || "unknown") });
  }
}
