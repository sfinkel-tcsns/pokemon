# Comment Mining — Clickster

Pulls every comment from every video on a YouTube channel and uses Claude to
summarize recurring viewer requests, questions, and game suggestions into a
markdown report — turning a low-engagement blind spot into a content-idea
backlog.

## Setup

```bash
pip install -r comment_mining/requirements.txt
export YOUTUBE_API_KEY=...   # Google Cloud project with YouTube Data API v3 enabled
export ANTHROPIC_API_KEY=...
```

Getting a YouTube Data API key: create/select a project in the
[Google Cloud Console](https://console.cloud.google.com/), enable "YouTube
Data API v3" under APIs & Services, then create an API key under
Credentials.

## Usage

One-shot (fetch + mine + report):

```bash
python -m comment_mining.cli run --channel @Clickster --output comment_mining/report.md
```

Or as two steps (useful if you want to re-run analysis without re-hitting the
YouTube API):

```bash
python -m comment_mining.cli fetch --channel @Clickster --output comment_mining/data/comments.json
python -m comment_mining.cli mine --input comment_mining/data/comments.json --output comment_mining/report.md
```

`--channel` accepts an `@handle`, a legacy username, or a raw channel ID
(`UC...`).

## How it works

1. **`youtube_fetch.py`** — resolves the channel, walks its uploads playlist,
   and pulls every comment thread (including full reply threads) for every
   video via the YouTube Data API v3. Caches the raw result to JSON so you're
   not re-spending API quota on every analysis run.
2. **`analyze.py`** — batches comments (150 at a time) and asks Claude to
   extract recurring questions, requests/feedback, and game suggestions from
   each batch as structured JSON. A second Claude call merges and ranks
   themes across all batches and synthesizes concrete content ideas from the
   results.
3. **`report.py`** — renders the final structured result into a markdown
   report: ranked game suggestions, ranked questions, ranked requests, and a
   list of suggested videos with rationale.

## Notes

- YouTube Data API quota: fetching costs roughly 1 unit per page of videos,
  comment threads, and replies (default daily quota is 10,000 units) —
  comment-heavy channels with tens of thousands of comments may need to
  request a quota increase or run `fetch` across multiple days.
- Videos with comments disabled are skipped automatically.
- Comments shorter than 3 characters (emoji-only, "first!", etc.) are
  filtered out before analysis.
- Defaults to `claude-opus-4-8` for analysis; override with `--model` on the
  `mine`/`run` commands.
