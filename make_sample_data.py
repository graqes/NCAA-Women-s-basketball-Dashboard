"""
Build data/sample.js - the backup the dashboard falls back to if the live
MySQL connection is unavailable. The live site normally never loads it.

Usage:
  python3 make_sample_data.py ~/Desktop/teams_cleaned.csv
"""

import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

FIRST_SEASON = 2014
MIN_GAMES = 15
GAME_SEASON = 2026   # games ship for this season only, to keep the file small
GAME_TEAMS = 40      # and only for this many top teams


def num(v):
    if v is None or v == "":
        return None
    try:
        return int(v)
    except ValueError:
        return float(v)


def avg(values):
    vals = [v for v in values if v is not None]
    return round(statistics.fmean(vals), 2) if vals else None


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop/teams_cleaned.csv"
    out_dir = Path(__file__).parent / "data"
    out_dir.mkdir(exist_ok=True)

    with open(src, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if int(r["season"]) >= FIRST_SEASON]

    by_season = defaultdict(list)
    by_team_season = defaultdict(list)
    for r in rows:
        by_season[int(r["season"])].append(r)
        by_team_season[(int(r["season"]), int(r["team_id"]))].append(r)

    seasons = [{
        "season": season,
        "games": len({g["game_id"] for g in games}),
        "avg_points": avg([num(g["team_score"]) for g in games]),
        "avg_assists": avg([num(g["assists"]) for g in games]),
        "avg_fouls": avg([num(g["fouls"]) for g in games]),
        "avg_steals": avg([num(g["steals"]) for g in games]),
        "avg_blocks": avg([num(g["blocks"]) for g in games]),
        "avg_three_pt_attempts": avg([num(g["three_point_field_goals_attempted"]) for g in games]),
        "avg_offensive_rebounds": avg([num(g["offensive_rebounds"]) for g in games]),
        "avg_defensive_rebounds": avg([num(g["defensive_rebounds"]) for g in games]),
    } for season, games in sorted(by_season.items())]

    standings = []
    for (season, team_id), games in by_team_season.items():
        if len(games) < MIN_GAMES:
            continue
        wins = sum(int(g["team_winner"]) for g in games)
        standings.append({
            "season": season,
            "team_id": team_id,
            "team_abbreviation": games[0]["team_abbreviation"],
            "team_display_name": games[0]["team_display_name"],
            "team_color": games[0]["team_color"],
            "games_played": len(games),
            "wins": wins,
            "losses": len(games) - wins,
            "win_rate": round(wins / len(games), 3),
            "avg_points": avg([num(g["team_score"]) for g in games]),
            "avg_assists": avg([num(g["assists"]) for g in games]),
            "avg_fouls": avg([num(g["fouls"]) for g in games]),
            "avg_steals": avg([num(g["steals"]) for g in games]),
            "avg_blocks": avg([num(g["blocks"]) for g in games]),
            "avg_total_rebounds": avg([num(g["total_rebounds"]) for g in games]),
        })
    standings.sort(key=lambda s: (-s["season"], -s["win_rate"]))

    # standings is already sorted best-first within each season
    top_ids = {s["team_id"] for s in standings
               if s["season"] == GAME_SEASON}.intersection(
        [s["team_id"] for s in standings if s["season"] == GAME_SEASON][:GAME_TEAMS])

    paired = defaultdict(list)
    for r in rows:
        if int(r["season"]) == GAME_SEASON:
            paired[r["game_id"]].append(r)

    games_by_team = defaultdict(list)
    for pair in paired.values():
        if len(pair) != 2:
            continue
        for me, them in ((pair[0], pair[1]), (pair[1], pair[0])):
            if int(me["team_id"]) not in top_ids:
                continue
            games_by_team[int(me["team_id"])].append({
                "game_date": me["game_date"],
                "team_home_away": me["team_home_away"],
                "team_score": num(me["team_score"]),
                "team_winner": int(me["team_winner"]),
                "opponent_score": num(them["team_score"]),
                "opponent": them["team_display_name"],
                "assists": num(me["assists"]),
                "fouls": num(me["fouls"]),
                "steals": num(me["steals"]),
                "blocks": num(me["blocks"]),
                "total_rebounds": num(me["total_rebounds"]),
                "field_goal_pct": num(me["field_goal_pct"]),
                "three_point_field_goals_attempted": num(me["three_point_field_goals_attempted"]),
            })
    for team_games in games_by_team.values():
        team_games.sort(key=lambda g: g["game_date"])

    payload = {
        "game_season": GAME_SEASON,
        "seasons": seasons,
        "standings": standings,
        "games": {str(k): v for k, v in games_by_team.items()},
    }

    # Written as a .js file, not .json: browsers refuse to fetch() a local file
    # when the page is opened directly from a folder, but a <script> tag always
    # loads. This is what lets the dashboard run without a web server.
    out = out_dir / "sample.js"
    out.write_text(
        "window.SAMPLE_DATA = " + json.dumps(payload, separators=(",", ":")) + ";",
        encoding="utf-8")
    print(f"Wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
    print(f"  {len(seasons)} seasons, {len(standings)} team-seasons, "
          f"{len(games_by_team)} teams with {GAME_SEASON} games")


if __name__ == "__main__":
    main()
