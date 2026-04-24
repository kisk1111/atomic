import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const rows = await sql`
      SELECT played_at, time_control, variant, duration_min, moves, score,
             user_name, user_rating, user_change, user_color,
             opponent_name, opponent_rating, opponent_change,
             result, winner_name, white_player, black_player
      FROM games
      ORDER BY played_at ASC
    `;
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ games: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "db error" });
  }
}
