"""Render a MinedReport into a markdown file."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from comment_mining.analyze import MinedReport


def _section(title: str, items: list[dict], name_key: str) -> str:
    if not items:
        return f"## {title}\n\n_No clear recurring pattern found._\n"
    lines = [f"## {title}\n"]
    for i, item in enumerate(items, 1):
        lines.append(f"### {i}. {item[name_key]}  ({item['total_count']} mentions)")
        for q in item.get("example_quotes", []):
            q = q.replace("\n", " ").strip()
            lines.append(f"> {q}")
        lines.append("")
    return "\n".join(lines)


def render_markdown(report: MinedReport, channel: str) -> str:
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    parts = [
        f"# Comment Mining Report — {channel}",
        "",
        f"Generated {generated}  \n"
        f"Videos covered: {report.video_count}  \n"
        f"Comments analyzed: {report.total_comments_analyzed}",
        "",
        _section("Recurring Game Suggestions", report.game_suggestions, "game"),
        _section("Recurring Questions", report.questions, "theme"),
        _section("Recurring Requests / Feedback", report.requests, "theme"),
        "## Content Ideas\n",
    ]
    if report.content_ideas:
        for i, idea in enumerate(report.content_ideas, 1):
            parts.append(f"{i}. **{idea['idea']}**  \n   _{idea['rationale']}_")
    else:
        parts.append("_None generated._")
    parts.append("")
    return "\n".join(parts)


def save_report(report: MinedReport, channel: str, output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(report, channel))
    print(f"Report written to {output_path}")
