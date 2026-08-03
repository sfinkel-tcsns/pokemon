"""Comment mining CLI for a YouTube channel.

Usage:
    python -m comment_mining.cli fetch --channel @Clickster --output data/comments.json
    python -m comment_mining.cli mine --input data/comments.json --output report.md
    python -m comment_mining.cli run --channel @Clickster --output report.md
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from comment_mining import youtube_fetch, report as report_mod
from comment_mining.analyze import mine_comments, DEFAULT_MODEL


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def cmd_fetch(args):
    api_key = args.api_key or _require_env("YOUTUBE_API_KEY")
    data = youtube_fetch.fetch_all_comments(api_key, args.channel, max_videos=args.max_videos)
    youtube_fetch.save(data, args.output)


def cmd_mine(args):
    data = json.loads(open(args.input).read())
    mined = mine_comments(data["comments"], data["video_count"], model=args.model)
    report_mod.save_report(mined, args.channel or data.get("channel_id", "channel"), args.output)


def cmd_run(args):
    api_key = args.api_key or _require_env("YOUTUBE_API_KEY")
    data = youtube_fetch.fetch_all_comments(api_key, args.channel, max_videos=args.max_videos)
    if args.cache:
        youtube_fetch.save(data, args.cache)
    mined = mine_comments(data["comments"], data["video_count"], model=args.model)
    report_mod.save_report(mined, args.channel, args.output)


def main():
    parser = argparse.ArgumentParser(description="Clickster comment mining")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch", help="Pull all comments for a channel into a JSON cache")
    p_fetch.add_argument("--channel", required=True, help="Channel @handle or channel ID (UC...)")
    p_fetch.add_argument("--output", default="comment_mining/data/comments.json")
    p_fetch.add_argument("--max-videos", type=int, default=None, dest="max_videos")
    p_fetch.add_argument("--api-key", default=None, dest="api_key")
    p_fetch.set_defaults(func=cmd_fetch)

    p_mine = sub.add_parser("mine", help="Analyze a cached comments JSON into a report")
    p_mine.add_argument("--input", required=True)
    p_mine.add_argument("--output", default="comment_mining/report.md")
    p_mine.add_argument("--model", default=DEFAULT_MODEL)
    p_mine.add_argument("--channel", default=None)
    p_mine.set_defaults(func=cmd_mine)

    p_run = sub.add_parser("run", help="Fetch + mine + report in one shot")
    p_run.add_argument("--channel", required=True)
    p_run.add_argument("--output", default="comment_mining/report.md")
    p_run.add_argument("--cache", default="comment_mining/data/comments.json")
    p_run.add_argument("--max-videos", type=int, default=None, dest="max_videos")
    p_run.add_argument("--model", default=DEFAULT_MODEL)
    p_run.add_argument("--api-key", default=None, dest="api_key")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
