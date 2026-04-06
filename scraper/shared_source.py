"""Shared source helpers for scraper idempotency.

These helpers let multiple scrapers stamp the same source identity fields
without sharing parser-specific code.
"""

from __future__ import annotations

from typing import Any


SOURCE_IDENTITY_FIELDS = ("source_name", "source_event_key", "source_url")


def clean_shared_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def stamp_source_identity(
    event_dict: dict[str, Any],
    source_name: str,
    source_event_key: str,
    source_url: str | None = None,
) -> dict[str, Any]:
    event_dict["source_name"] = clean_shared_text(source_name)
    event_dict["source_event_key"] = clean_shared_text(source_event_key)
    event_dict["source_url"] = clean_shared_text(source_url or source_event_key)
    return event_dict


def has_source_identity(event: dict[str, Any]) -> bool:
    return bool(clean_shared_text(event.get("source_name")) and clean_shared_text(event.get("source_event_key")))


def source_identity_matches(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return (
        clean_shared_text(left.get("source_name")).casefold() == clean_shared_text(right.get("source_name")).casefold()
        and clean_shared_text(left.get("source_event_key")).casefold() == clean_shared_text(right.get("source_event_key")).casefold()
    )