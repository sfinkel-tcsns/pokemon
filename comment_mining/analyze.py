"""Mine recurring requests, questions, and game suggestions out of a batch of
YouTube comments using Claude, via a map (per-chunk extraction) then reduce
(cross-chunk merge) pass.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import anthropic

DEFAULT_MODEL = "claude-opus-4-8"
CHUNK_SIZE = 150  # comments per extraction call
MIN_COMMENT_LEN = 3

THEME_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string", "description": "The recurring question, generalized"},
                    "count": {"type": "integer"},
                    "quotes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["theme", "count", "quotes"],
                "additionalProperties": False,
            },
        },
        "requests": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string", "description": "The recurring request/feedback, generalized"},
                    "count": {"type": "integer"},
                    "quotes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["theme", "count", "quotes"],
                "additionalProperties": False,
            },
        },
        "game_suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "game": {"type": "string", "description": "The specific game or game genre suggested"},
                    "count": {"type": "integer"},
                    "quotes": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["game", "count", "quotes"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["questions", "requests", "game_suggestions"],
    "additionalProperties": False,
}

MERGE_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string"},
                    "total_count": {"type": "integer"},
                    "example_quotes": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                },
                "required": ["theme", "total_count", "example_quotes"],
                "additionalProperties": False,
            },
        },
        "requests": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string"},
                    "total_count": {"type": "integer"},
                    "example_quotes": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                },
                "required": ["theme", "total_count", "example_quotes"],
                "additionalProperties": False,
            },
        },
        "game_suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "game": {"type": "string"},
                    "total_count": {"type": "integer"},
                    "example_quotes": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                },
                "required": ["game", "total_count", "example_quotes"],
                "additionalProperties": False,
            },
        },
        "content_ideas": {
            "type": "array",
            "description": "Concrete video/content ideas synthesized from the themes above",
            "items": {
                "type": "object",
                "properties": {
                    "idea": {"type": "string"},
                    "rationale": {"type": "string"},
                },
                "required": ["idea", "rationale"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["questions", "requests", "game_suggestions", "content_ideas"],
    "additionalProperties": False,
}

EXTRACT_SYSTEM = """You mine YouTube comments for a gaming/Pokemon-adjacent channel called \
Clickster. Given a batch of raw viewer comments, identify recurring patterns in three \
categories: questions viewers keep asking, requests/feedback viewers keep making (e.g. \
"do a part 2", "fix the audio", "play on hard mode"), and specific games or game genres \
viewers suggest the channel play. Group near-duplicate comments into a single generalized \
theme with a count of how many comments matched it, and 1-3 representative verbatim quotes. \
Ignore low-signal comments (pure emoji, "first!", generic praise with no actionable content). \
If a category has no clear recurring pattern in this batch, return an empty list for it."""

MERGE_SYSTEM = """You are merging theme-extraction results from multiple batches of YouTube \
comments for the same channel. Each batch already identified recurring questions, requests, \
and game suggestions with counts and quotes. Consolidate near-duplicate themes across batches \
into single entries, summing their counts, and keep up to 3 of the best representative quotes \
per merged theme. Rank each category's list by total_count descending. Then, based on the \
consolidated themes, propose 3-7 concrete content ideas (specific video concepts) that would \
directly address the channel's audience's most common questions, requests, and game requests."""


@dataclass
class MinedReport:
    questions: list[dict]
    requests: list[dict]
    game_suggestions: list[dict]
    content_ideas: list[dict]
    total_comments_analyzed: int
    video_count: int


def _chunk(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _filter_comments(comments: list[dict]) -> list[dict]:
    return [c for c in comments if len(c["text"].strip()) >= MIN_COMMENT_LEN]


def _format_batch(comments: list[dict]) -> str:
    lines = []
    for c in comments:
        text = c["text"].replace("\n", " ").strip()
        lines.append(f"- [{c['video_title'][:50]}] {text}")
    return "\n".join(lines)


def _extract_chunk(client: anthropic.Anthropic, model: str, comments: list[dict]) -> dict:
    batch_text = _format_batch(comments)
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=EXTRACT_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": THEME_SCHEMA}},
        messages=[{"role": "user", "content": f"Comments:\n{batch_text}"}],
    )
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def _merge_chunks(client: anthropic.Anthropic, model: str, chunk_results: list[dict]) -> dict:
    response = client.messages.create(
        model=model,
        max_tokens=8192,
        system=MERGE_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": MERGE_SCHEMA}},
        messages=[{
            "role": "user",
            "content": f"Per-batch extraction results (JSON array):\n{json.dumps(chunk_results)}",
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def mine_comments(comments: list[dict], video_count: int, model: str = DEFAULT_MODEL) -> MinedReport:
    client = anthropic.Anthropic()
    filtered = _filter_comments(comments)
    chunks = list(_chunk(filtered, CHUNK_SIZE))

    chunk_results = []
    for i, chunk in enumerate(chunks, 1):
        print(f"[{i}/{len(chunks)}] Extracting themes from {len(chunk)} comments...")
        chunk_results.append(_extract_chunk(client, model, chunk))

    print(f"Merging {len(chunk_results)} batch result(s)...")
    merged = _merge_chunks(client, model, chunk_results)

    return MinedReport(
        questions=merged["questions"],
        requests=merged["requests"],
        game_suggestions=merged["game_suggestions"],
        content_ideas=merged["content_ideas"],
        total_comments_analyzed=len(filtered),
        video_count=video_count,
    )
