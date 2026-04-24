"""Convert chess.com atomic games txt dump into a normalized CSV.

Usage:
    python convert.py            # reads games.txt -> games.csv
    python convert.py input.txt output.csv

The parser pulls: date, time control, duration, moves, result (score),
both player names and ratings, point changes, winner, and colors.

Color logic: chess.com's listing order is inconsistent, so we use the
point changes + score to derive it. Whoever gains points is the winner
(or draw if score is 1/2). If score is 1-0 the winner was white; if 0-1
the winner was black.
"""
from __future__ import annotations

import csv
import re
import sys
from datetime import datetime
from pathlib import Path

USER = "w-a-s-u-k-e"
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}


def parse_date(s: str) -> str:
    """'Apr 23 8:09 AM' -> ISO datetime, assuming current year."""
    m = re.match(r"([A-Za-z]{3})\s+(\d+)\s+(\d+):(\d+)\s*(AM|PM)", s.strip())
    if not m:
        return s
    mon, day, hour, minute, ampm = m.groups()
    hour = int(hour) % 12 + (12 if ampm == "PM" else 0)
    now = datetime.now()
    dt = datetime(now.year, MONTHS[mon], int(day), hour, int(minute))
    if dt > now:
        dt = dt.replace(year=now.year - 1)
    return dt.isoformat(timespec="minutes")


def blocks(text: str):
    current: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if current:
                yield current
                current = []
        else:
            current.append(line)
    if current:
        yield current


def parse_block(lines: list[str]) -> dict | None:
    if len(lines) < 13:
        return None
    tc, variant, date_str = lines[0], lines[1], lines[2]
    dur = lines[3].lstrip("• ").strip().rstrip("'")
    moves = lines[4].lstrip("• ").strip()
    # lines[5] is 'p' (rated marker) — skip
    score = lines[6].lstrip("• ").strip()
    p1_name = lines[7]
    p1_rating = int(lines[8].strip("()"))
    p1_change = float(lines[9])
    p2_name = lines[10]
    p2_rating = int(lines[11].strip("()"))
    p2_change = float(lines[12])

    # Determine winner by point change (most reliable)
    if score == "½-½" or abs(p1_change - p2_change) < 0.01 and p1_change >= 0 and p2_change >= 0:
        result = "draw"
        winner = None
    elif p1_change > p2_change:
        result = "win" if p1_name == USER else "loss"
        winner = p1_name
    else:
        result = "win" if p2_name == USER else "loss"
        winner = p2_name

    # Color from score + winner
    if score == "1-0":
        white = winner
    elif score == "0-1":
        white = (p2_name if winner == p1_name else p1_name)
    else:  # draw — can't determine from score alone
        white = None
    black = (p2_name if white == p1_name else p1_name) if white else None

    is_p1_user = p1_name == USER
    user_rating = p1_rating if is_p1_user else p2_rating
    user_change = p1_change if is_p1_user else p2_change
    opp_name = p2_name if is_p1_user else p1_name
    opp_rating = p2_rating if is_p1_user else p1_rating

    user_color = None
    if white == USER:
        user_color = "white"
    elif black == USER:
        user_color = "black"

    return {
        "datetime": parse_date(date_str),
        "time_control": tc,
        "variant": variant,
        "duration_min": dur,
        "moves": moves,
        "score": score,
        "result": result,
        "user_rating": user_rating,
        "user_change": user_change,
        "user_color": user_color or "",
        "opponent": opp_name,
        "opponent_rating": opp_rating,
    }


def convert(in_path: Path, out_path: Path) -> int:
    text = in_path.read_text(encoding="utf-8")
    rows: list[dict] = []
    seen: set[tuple] = set()
    for blk in blocks(text):
        row = parse_block(blk)
        if not row:
            continue
        key = (row["datetime"], row["opponent"])
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
    rows.sort(key=lambda r: r["datetime"])
    fields = list(rows[0].keys()) if rows else []
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


if __name__ == "__main__":
    inp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("games.txt")
    outp = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("games.csv")
    n = convert(inp, outp)
    print(f"wrote {n} games to {outp}")
