import { neon } from "@neondatabase/serverless";
import { parseText } from "../lib/parse.js";
import crypto from "node:crypto";

const sql = neon(process.env.DATABASE_URL);

function timingSafeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
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
  const { password, text, user } = body || {};
  if (!timingSafeEqual(password || "", expected)) {
    return res.status(401).json({ error: "bad password" });
  }
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "missing text" });
  }

  const games = parseText(text, user || "w-a-s-u-k-e");
  if (!games.length) return res.status(200).json({ parsed: 0, inserted: 0 });

  // Bulk upsert via INSERT ... ON CONFLICT DO NOTHING
  let inserted = 0;
  for (const g of games) {
    try {
      const r = await sql`
        INSERT INTO games (
          played_at, time_control, variant, duration_min, moves, score,
          user_name, user_rating, user_change, user_color,
          opponent_name, opponent_rating, opponent_change,
          result, winner_name, white_player, black_player
        ) VALUES (
          ${g.played_at}, ${g.time_control}, ${g.variant}, ${g.duration_min}, ${g.moves}, ${g.score},
          ${g.user_name}, ${g.user_rating}, ${g.user_change}, ${g.user_color},
          ${g.opponent_name}, ${g.opponent_rating}, ${g.opponent_change},
          ${g.result}, ${g.winner_name}, ${g.white_player}, ${g.black_player}
        )
        ON CONFLICT (played_at, user_name, opponent_name) DO NOTHING
        RETURNING id
      `;
      if (r.length) inserted++;
    } catch (e) {
      console.error("insert failed", e);
    }
  }

  return res.status(200).json({
    parsed: games.length,
    inserted,
    duplicates: games.length - inserted,
  });
}
