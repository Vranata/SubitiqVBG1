"""Cleanup duplicate Programata events already stored in Supabase.

The script reuses the Programata matching logic from scrape_events_programata.py
so existing duplicate rows are merged into a canonical event, likes are moved to
the canonical row, and duplicate rows are deleted.
"""

from __future__ import annotations

import argparse
import logging
from typing import Any

from scrape_events_programata import (
    build_event_payload,
    choose_canonical_event_match,
    create_supabase_client,
    load_existing_programata_events,
    merge_programata_event_payload,
    programata_events_can_merge,
    sync_existing_event_cache,
    verify_supabase_connection,
)


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def event_group_key(event: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(event.get("name_event") or "").casefold().strip(),
        str(event.get("name_artist") or "").casefold().strip(),
        str(event.get("id_event_category") or "").strip(),
        str(event.get("id_user") or "").strip(),
    )


def build_duplicate_clusters(events: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    clusters: list[list[dict[str, Any]]] = []
    grouped_events: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = {}

    for event in events:
        grouped_events.setdefault(event_group_key(event), []).append(event)

    for group_events in grouped_events.values():
        remaining = list(group_events)
        while remaining:
            cluster = [remaining.pop(0)]
            changed = True
            while changed:
                changed = False
                next_remaining: list[dict[str, Any]] = []
                for candidate in remaining:
                    if any(programata_events_can_merge(existing, candidate) for existing in cluster):
                        cluster.append(candidate)
                        changed = True
                    else:
                        next_remaining.append(candidate)
                remaining = next_remaining

            if len(cluster) > 1:
                clusters.append(cluster)

    return clusters


def cleanup_duplicates(dry_run: bool = False) -> int:
    client = create_supabase_client()
    verify_supabase_connection(client)

    existing_events = load_existing_programata_events(client)
    clusters = build_duplicate_clusters(existing_events)

    if not clusters:
        logger.info("No duplicate Programata clusters found.")
        return 0

    logger.info("Found %s duplicate clusters.", len(clusters))

    for cluster in sorted(clusters, key=len, reverse=True):
        canonical_event = choose_canonical_event_match(cluster)
        canonical_event_id = int(canonical_event["id_event"])
        duplicate_event_ids = [int(row["id_event"]) for row in cluster if int(row["id_event"]) != canonical_event_id]

        logger.info(
            "Cluster size=%s canonical=%s duplicates=%s",
            len(cluster),
            canonical_event_id,
            duplicate_event_ids,
        )

        if dry_run:
            continue

        merged_payload = merge_programata_event_payload(
            build_event_payload(canonical_event),
            [row for row in cluster if int(row["id_event"]) != canonical_event_id],
        )
        response = client.table("events").update(merged_payload).eq("id_event", canonical_event_id).execute()

        if duplicate_event_ids:
            likes_response = client.table("event_likes").select("id_user").in_("id_event", duplicate_event_ids).execute()
            likes_rows = likes_response.data or []
            if likes_rows:
                transferred_likes = [
                    {
                        "id_user": int(row["id_user"]),
                        "id_event": canonical_event_id,
                    }
                    for row in likes_rows
                ]
                client.table("event_likes").upsert(transferred_likes, on_conflict="id_user,id_event").execute()

            client.table("events").delete().in_("id_event", duplicate_event_ids).execute()

        if response.data:
            sync_existing_event_cache(existing_events, duplicate_event_ids, response.data[0])

    logger.info("Cleanup completed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge duplicate Programata events already stored in Supabase.")
    parser.add_argument("--dry-run", action="store_true", help="Report duplicate clusters without changing the database.")
    args = parser.parse_args()
    return cleanup_duplicates(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())