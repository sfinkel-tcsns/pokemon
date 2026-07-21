"""Pull all videos + comments for a YouTube channel via the Data API v3."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


@dataclass
class Comment:
    video_id: str
    video_title: str
    comment_id: str
    author: str
    text: str
    like_count: int
    published_at: str
    is_reply: bool
    parent_id: str | None = None


def get_client(api_key: str):
    return build("youtube", "v3", developerKey=api_key)


def resolve_channel_id(youtube, channel: str) -> str:
    """Accept a raw channel ID (UC...), an @handle, or a legacy username."""
    if channel.startswith("UC") and len(channel) == 24:
        return channel

    handle = channel if channel.startswith("@") else f"@{channel}"
    resp = youtube.channels().list(part="id", forHandle=handle).execute()
    items = resp.get("items", [])
    if items:
        return items[0]["id"]

    resp = youtube.channels().list(part="id", forUsername=channel).execute()
    items = resp.get("items", [])
    if items:
        return items[0]["id"]

    raise ValueError(f"Could not resolve channel '{channel}' to a channel ID")


def get_uploads_playlist_id(youtube, channel_id: str) -> str:
    resp = youtube.channels().list(part="contentDetails", id=channel_id).execute()
    items = resp["items"]
    if not items:
        raise ValueError(f"No channel found for ID {channel_id}")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def list_all_videos(youtube, uploads_playlist_id: str, max_videos: int | None = None) -> list[dict]:
    videos = []
    page_token = None
    while True:
        resp = youtube.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=uploads_playlist_id,
            maxResults=50,
            pageToken=page_token,
        ).execute()
        for item in resp.get("items", []):
            videos.append({
                "video_id": item["contentDetails"]["videoId"],
                "title": item["snippet"]["title"],
                "published_at": item["snippet"]["publishedAt"],
            })
            if max_videos and len(videos) >= max_videos:
                return videos
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return videos


def fetch_comments_for_video(youtube, video_id: str, video_title: str) -> list[Comment]:
    comments: list[Comment] = []
    page_token = None
    while True:
        try:
            resp = youtube.commentThreads().list(
                part="snippet,replies",
                videoId=video_id,
                maxResults=100,
                pageToken=page_token,
                textFormat="plainText",
                order="relevance",
            ).execute()
        except HttpError as e:
            reason = ""
            try:
                reason = e.error_details[0].get("reason", "")
            except Exception:
                pass
            if e.resp.status == 403 or reason in ("commentsDisabled", "videoNotFound"):
                return comments
            raise

        for item in resp.get("items", []):
            top = item["snippet"]["topLevelComment"]
            top_snippet = top["snippet"]
            comments.append(Comment(
                video_id=video_id,
                video_title=video_title,
                comment_id=top["id"],
                author=top_snippet.get("authorDisplayName", ""),
                text=top_snippet.get("textDisplay", ""),
                like_count=top_snippet.get("likeCount", 0),
                published_at=top_snippet.get("publishedAt", ""),
                is_reply=False,
            ))

            total_replies = item["snippet"].get("totalReplyCount", 0)
            inline_replies = item.get("replies", {}).get("comments", [])
            seen_reply_ids = {r["id"] for r in inline_replies}
            for r in inline_replies:
                rs = r["snippet"]
                comments.append(Comment(
                    video_id=video_id,
                    video_title=video_title,
                    comment_id=r["id"],
                    author=rs.get("authorDisplayName", ""),
                    text=rs.get("textDisplay", ""),
                    like_count=rs.get("likeCount", 0),
                    published_at=rs.get("publishedAt", ""),
                    is_reply=True,
                    parent_id=top["id"],
                ))

            if total_replies > len(seen_reply_ids):
                comments.extend(
                    _fetch_remaining_replies(youtube, top["id"], video_id, video_title, seen_reply_ids)
                )

        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return comments


def _fetch_remaining_replies(youtube, parent_id: str, video_id: str, video_title: str, seen_ids: set) -> list[Comment]:
    out = []
    page_token = None
    while True:
        resp = youtube.comments().list(
            part="snippet",
            parentId=parent_id,
            maxResults=100,
            pageToken=page_token,
            textFormat="plainText",
        ).execute()
        for r in resp.get("items", []):
            if r["id"] in seen_ids:
                continue
            rs = r["snippet"]
            out.append(Comment(
                video_id=video_id,
                video_title=video_title,
                comment_id=r["id"],
                author=rs.get("authorDisplayName", ""),
                text=rs.get("textDisplay", ""),
                like_count=rs.get("likeCount", 0),
                published_at=rs.get("publishedAt", ""),
                is_reply=True,
                parent_id=parent_id,
            ))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return out


def fetch_all_comments(api_key: str, channel: str, max_videos: int | None = None, sleep_between: float = 0.05) -> dict:
    youtube = get_client(api_key)
    channel_id = resolve_channel_id(youtube, channel)
    uploads_playlist_id = get_uploads_playlist_id(youtube, channel_id)
    videos = list_all_videos(youtube, uploads_playlist_id, max_videos=max_videos)

    all_comments: list[Comment] = []
    for i, video in enumerate(videos, 1):
        print(f"[{i}/{len(videos)}] Fetching comments for: {video['title'][:60]}")
        try:
            all_comments.extend(fetch_comments_for_video(youtube, video["video_id"], video["title"]))
        except HttpError as e:
            print(f"  skipped ({e})")
        time.sleep(sleep_between)

    return {
        "channel_id": channel_id,
        "video_count": len(videos),
        "videos": videos,
        "comments": [asdict(c) for c in all_comments],
    }


def save(data: dict, output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Saved {len(data['comments'])} comments from {data['video_count']} videos to {output_path}")
