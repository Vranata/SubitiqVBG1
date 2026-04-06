"""Programata.bg event scraper for Culturo BG.

This script parses `.post-list-entry` cards from Programata.bg, follows the
linked detail page, extracts event dictionaries with BeautifulSoup, and stores
the results in Supabase with a best-effort deduplication step.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag
from requests import RequestException
from supabase import Client, create_client


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


EVENT_CARD_SELECTOR = ".post-list-entry"
CARD_TITLE_SELECTOR = "h3 a, h3"
CARD_AUTHOR_SELECTOR = "span"
CARD_LINK_SELECTOR = "h3 a[href], .figure a[href]"
CARD_IMAGE_SELECTOR = ".figure img, img"
OWNER_SELECTORS = ["[data-user-id]", "[data-owner-id]", "[data-auth-user-id]"]

DETAIL_CONTAINER_SELECTORS = ["article", ".entry-content", ".post-content"]
DETAIL_TITLE_SELECTORS = ["article h1", "h1", ".entry-title"]
DETAIL_BREADCRUMB_SELECTORS = [".breadcrumbs a", "nav.breadcrumbs a", ".breadcrumb a"]
DETAIL_META_DESCRIPTION_SELECTORS = ['meta[property="og:description"]', 'meta[name="description"]']
DETAIL_META_IMAGE_SELECTORS = ['meta[property="og:image"]', 'meta[name="twitter:image"]']
DETAIL_META_AUTHOR_SELECTORS = ['meta[name="author"]', 'meta[property="article:author"]']
DETAIL_META_PUBLISHED_SELECTORS = ['meta[property="article:published_time"]', 'time[datetime]']

STOP_SECTION_TITLES = {"може също да ти хареса", "additional links", "последвай ни"}

MONTHS_BG = {
    "януари": 1,
    "февруари": 2,
    "март": 3,
    "април": 4,
    "май": 5,
    "юни": 6,
    "юли": 7,
    "август": 8,
    "септември": 9,
    "октомври": 10,
    "ноември": 11,
    "декември": 12,
}

BULGARIAN_MONTH_PATTERN = r"(?:януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)"

PROGRAMATA_CATEGORY_SYNONYMS = {
    "кино": "Кино",
    "сцена": "Театър",
    "театър": "Театър",
    "музика": "Концерти",
    "концерт": "Концерти",
    "изложба": "Фестивали",
    "изложения": "Фестивали",
    "изложби": "Фестивали",
    "литература": "Фестивали",
    "градът": "Фестивали",
    "фестивал": "Фестивали",
    "спорт": "Спорт",
}

PROGRAMATA_DEFAULT_CATEGORY_NAME = "Фестивали"
PROGRAMATA_DEFAULT_REGION_NAME = "Непосочен регион"
PROGRAMATA_DEFAULT_SOURCE_URL = "https://programata.bg/"

PROGRAMATA_PATH_CATEGORY_HINTS = [
    ("/kino/", "Кино"),
    ("/muzika/", "Концерти"),
    ("/stsena/", "Театър"),
    ("/izlozhbi/", "Фестивали"),
    ("/literatura/", "Фестивали"),
    ("/gradat/", "Фестивали"),
]

EVENT_PAYLOAD_KEYS = [
    "name_event",
    "name_artist",
    "place_event",
    "id_event_category",
    "id_user",
    "id_region",
    "start_date",
    "start_hour",
    "end_date",
    "end_hour",
    "picture",
    "description",
]

SCHEDULE_LINE_RE = re.compile(
    r"^(?P<start_day>\d{1,2})(?:\s*[-–]\s*(?P<end_day>\d{1,2}))?\s+(?P<month>[А-Яа-я]+)(?:\s+(?P<year>\d{4}))?(?:\s*,\s*(?P<time>\d{1,2}:\d{2})(?:\s*ч\.?))?(?:\s*,\s*(?P<place>.+))?$",
    re.IGNORECASE,
)

DATE_RANGE_RE = re.compile(
    r"(?P<start_day>\d{1,2})(?:\s*[-–]\s*(?P<end_day>\d{1,2}))?\s+(?P<month>[А-Яа-я]+)(?:\s+(?P<year>\d{4}))?",
    re.IGNORECASE,
)

NUMERIC_SCHEDULE_RE = re.compile(
    r'''(?P<start_date>\d{2}\.\d{2}\.\d{4})(?:\s*\([^)]+\))?\s*[–-]\s*(?P<time>\d{1,2}:\d{2})(?:\s*ч\.?)?\s*[–-]\s*(?P<city>[А-ЯA-ZА-Яа-яЁё„“"'\-\. ]{2,60}?),\s*(?P<place>[^.]+?)(?=(?:\s+\d{2}\.\d{2}\.\d{4})|$)''',
    re.IGNORECASE,
)

CITY_MONTH_RANGE_RE = re.compile(
    rf'''(?P<city>[А-ЯA-ZА-Яа-яЁё„“"'\-\. ]{{2,60}}?)\s+(?P<start_day>\d{{1,2}})\s+(?P<start_month>{BULGARIAN_MONTH_PATTERN})\s+(?P<start_year>\d{{4}})\s*[–-]\s*(?P<end_day>\d{{1,2}})\s+(?P<end_month>{BULGARIAN_MONTH_PATTERN})\s+(?P<end_year>\d{{4}})(?:\s*[–-]\s*(?P<place>[^.]+?))?(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))''',
    re.IGNORECASE,
)

CITY_MONTH_TIME_RE = re.compile(
    rf'''(?P<city>[А-ЯA-ZА-Яа-яЁё„“"'\-\. ]{{2,60}}?)\s+(?P<day>\d{{1,2}})\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:,\s*(?P<time>\d{{1,2}}:\d{{2}})(?:\s*ч\.?)?)?\s*[–-]\s*(?P<place>[^.]+?)(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))''',
    re.IGNORECASE,
)

DATE_RANGE_TEXT_RE = re.compile(
    rf"(?P<start_day>\d{{1,2}})\s*(?:и|[-–])\s*(?P<end_day>\d{{1,2}})\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:\s*(?:в|на)\s+(?P<place>[^.]+?))?(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))",
    re.IGNORECASE,
)

SIMPLE_DATE_TEXT_RE = re.compile(
    rf"(?:на\s+)?(?P<day>\d{{1,2}})\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:,\s*(?P<time>\d{{1,2}}:\d{{2}})(?:\s*ч\.?)?)?(?:\s*(?:в|на)\s+(?P<place>[^.]+?))?(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))",
    re.IGNORECASE,
)


@dataclass(slots=True)
class EventRecord:
    name_event: str
    name_artist: str
    place_event: str
    id_event_category: int
    id_user: int
    id_region: int
    start_date: str
    start_hour: str
    end_date: str
    end_hour: str
    picture: str | None
    description: str

    def to_payload(self) -> dict[str, Any]:
        return {
            "name_event": self.name_event,
            "name_artist": self.name_artist,
            "place_event": self.place_event,
            "id_event_category": self.id_event_category,
            "id_user": self.id_user,
            "id_region": self.id_region,
            "start_date": self.start_date,
            "start_hour": self.start_hour,
            "end_date": self.end_date,
            "end_hour": self.end_hour,
            "picture": self.picture,
            "description": self.description,
        }


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()


def first_text(card: Tag, selectors: list[str]) -> str:
    for selector in selectors:
        element = card.select_one(selector)
        if element is None:
            continue
        text = clean_text(element.get_text(" ", strip=True))
        if text:
            return text
    return ""


def first_text_or_datetime(card: Tag, selectors: list[str]) -> str:
    for selector in selectors:
        element = card.select_one(selector)
        if element is None:
            continue

        datetime_value = element.get("datetime")
        if datetime_value:
            return clean_text(str(datetime_value))

        text = clean_text(element.get_text(" ", strip=True))
        if text:
            return text

    return ""


def first_attr(card: Tag, attr_names: list[str]) -> str:
    for attr_name in attr_names:
        value = card.get(attr_name)
        if value:
            return clean_text(str(value))
    return ""


def parse_date_value(raw_value: str) -> str:
    raw_value = clean_text(raw_value)
    if not raw_value:
        raise ValueError("Missing date value")

    for date_format in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw_value, date_format).date().isoformat()
        except ValueError:
            continue

    if "T" in raw_value:
        try:
            return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            pass

    raise ValueError(f"Unsupported date format: {raw_value}")


def parse_time_value(raw_value: str) -> str:
    raw_value = clean_text(raw_value)
    if not raw_value:
        raise ValueError("Missing time value")

    for time_format in ("%H:%M", "%H.%M", "%H:%M:%S"):
        try:
            return datetime.strptime(raw_value, time_format).time().strftime("%H:%M:%S")
        except ValueError:
            continue

    if "T" in raw_value:
        try:
            return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).time().strftime("%H:%M:%S")
        except ValueError:
            pass

    raise ValueError(f"Unsupported time format: {raw_value}")


def normalize_lookup_key(value: str) -> str:
    return clean_text(value).casefold()


def resolve_lookup_id(raw_value: str, lookup_map: dict[str, int], label: str) -> int:
    cleaned_value = clean_text(raw_value)
    if not cleaned_value:
        raise ValueError(f"Missing {label} value")

    if cleaned_value.isdigit():
        return int(cleaned_value)

    matched = lookup_map.get(normalize_lookup_key(cleaned_value))
    if matched is not None:
        return matched

    raise ValueError(f"Unknown {label}: {cleaned_value}")


def resolve_owner_user_id(card: Tag, default_user_id: int | None) -> int:
    raw_value = first_attr(card, OWNER_SELECTORS)
    if raw_value.isdigit():
        return int(raw_value)
    if default_user_id is not None:
        return default_user_id
    raise ValueError("Missing event owner id. Set SCRAPER_DEFAULT_USER_ID or add a data-user-id attribute.")


def load_lookup_maps(client: Client) -> tuple[dict[str, int], dict[str, int]]:
    regions_response = client.table("regions").select("id_region, region").execute()
    categories_response = client.table("event_category").select("id_event_category, name_event_category").execute()

    region_map = {
        normalize_lookup_key(str(row["region"])): int(row["id_region"])
        for row in (regions_response.data or [])
    }
    category_map = {
        normalize_lookup_key(str(row["name_event_category"])): int(row["id_event_category"])
        for row in (categories_response.data or [])
    }
    return region_map, category_map


def first_match_text(root: Tag | BeautifulSoup, selectors: list[str], attribute: str | None = None) -> str:
    for selector in selectors:
        element = root.select_one(selector)
        if element is None:
            continue

        if attribute is not None:
            value = element.get(attribute)
            if value:
                return clean_text(str(value))

        text = clean_text(element.get_text(" ", strip=True))
        if text:
            return text

    return ""


def first_meta_content(root: BeautifulSoup, selectors: list[str]) -> str:
    return first_match_text(root, selectors, attribute="content")


def extract_card_href(card: Tag, base_url: str | None = None) -> str:
    href = first_match_text(card, [CARD_LINK_SELECTOR], attribute="href")
    if not href:
        return ""
    return urljoin(base_url or "", href)


def extract_card_image(card: Tag, base_url: str | None = None) -> str:
    src = first_match_text(card, [CARD_IMAGE_SELECTOR], attribute="src")
    if not src:
        return ""
    return urljoin(base_url or "", src)


def strip_trailing_year(value: str) -> str:
    cleaned_value = clean_text(value).strip('"“”')
    cleaned_value = re.sub(r"\s*[-–]\s*\d{4}$", "", cleaned_value)
    return cleaned_value.strip('"“”')


def parse_bulgarian_month(month_name: str) -> int:
    month_key = normalize_lookup_key(month_name)
    if month_key not in MONTHS_BG:
        raise ValueError(f"Unsupported month name: {month_name}")
    return MONTHS_BG[month_key]


def parse_bulgarian_date_range(value: str, year_hint: int | None = None) -> tuple[str, str]:
    cleaned_value = clean_text(value)
    match = DATE_RANGE_RE.search(cleaned_value)
    if match is None:
        raise ValueError(f"Unsupported date format: {value}")

    year_value = int(match.group("year") or year_hint or datetime.now().year)
    month_value = parse_bulgarian_month(match.group("month"))
    start_day = int(match.group("start_day"))
    end_day = int(match.group("end_day") or start_day)

    start_date = datetime(year_value, month_value, start_day).date().isoformat()
    end_date = datetime(year_value, month_value, end_day).date().isoformat()
    return start_date, end_date


def parse_programata_schedule_line(value: str, year_hint: int | None = None) -> dict[str, str]:
    cleaned_value = clean_text(value)
    match = SCHEDULE_LINE_RE.match(cleaned_value)
    if match is None:
        raise ValueError(f"Unsupported schedule line: {value}")

    year_value = int(match.group("year") or year_hint or datetime.now().year)
    month_value = parse_bulgarian_month(match.group("month"))
    start_day = int(match.group("start_day"))
    end_day = int(match.group("end_day") or start_day)
    start_date = datetime(year_value, month_value, start_day).date().isoformat()
    end_date = datetime(year_value, month_value, end_day).date().isoformat()

    time_value = match.group("time") or "00:00"
    start_hour = parse_time_value(time_value)
    end_hour = start_hour
    place_value = clean_text(match.group("place") or "")

    return {
        "start_date": start_date,
        "start_hour": start_hour,
        "end_date": end_date,
        "end_hour": end_hour,
        "place_event": place_value,
    }


def infer_programata_category_name(
    source_url: str | None,
    page_text: str,
    breadcrumb_text: str = "",
    section_title: str = "",
    card_title: str = "",
) -> str:
    url_path = urlparse(source_url or "").path.casefold()
    for path_fragment, category_name in PROGRAMATA_PATH_CATEGORY_HINTS:
        if path_fragment in url_path:
            return category_name

    combined_text = " ".join(part for part in [page_text, breadcrumb_text, section_title, card_title] if part).casefold()

    if "kino" in combined_text or "филм" in combined_text:
        return "Кино"
    if "сцен" in combined_text or "теат" in combined_text:
        return "Театър"
    if "музик" in combined_text or "концерт" in combined_text:
        return "Концерти"
    if "спорт" in combined_text:
        return "Спорт"
    if "фестив" in combined_text:
        return "Фестивали"
    if "излож" in combined_text or "литератур" in combined_text or "град" in combined_text:
        return PROGRAMATA_DEFAULT_CATEGORY_NAME

    return PROGRAMATA_DEFAULT_CATEGORY_NAME


def resolve_programata_category_id(
    category_lookup: dict[str, int],
    source_url: str | None,
    page_text: str,
    breadcrumb_text: str = "",
    section_title: str = "",
    card_title: str = "",
) -> int:
    category_name = infer_programata_category_name(source_url, page_text, breadcrumb_text, section_title, card_title)
    try:
        return resolve_lookup_id(category_name, category_lookup, "event category")
    except ValueError:
        fallback_key = normalize_lookup_key(PROGRAMATA_DEFAULT_CATEGORY_NAME)
        if fallback_key in category_lookup:
            return category_lookup[fallback_key]
        return next(iter(category_lookup.values()))


def resolve_programata_region_id(region_lookup: dict[str, int], page_text: str, place_text: str = "") -> int:
    combined_text = normalize_lookup_key(" ".join(part for part in [page_text, place_text] if part))
    fallback_region_id = (
        region_lookup.get(normalize_lookup_key(PROGRAMATA_DEFAULT_REGION_NAME))
        or region_lookup.get(0)
        or 0
    )

    if not combined_text:
        return fallback_region_id

    if "софия" in combined_text:
        sofia_region_id = (
            region_lookup.get(normalize_lookup_key("София-град"))
            or region_lookup.get(normalize_lookup_key("София град"))
            or region_lookup.get(normalize_lookup_key("София"))
        )
        if sofia_region_id is not None:
            return sofia_region_id

    ordered_regions = sorted(region_lookup.items(), key=lambda item: len(item[0]), reverse=True)
    for region_name, region_id in ordered_regions:
        if region_name == normalize_lookup_key(PROGRAMATA_DEFAULT_REGION_NAME):
            continue
        if region_name and region_name in combined_text:
            return region_id

    return fallback_region_id


def extract_article_container(soup: BeautifulSoup) -> Tag | BeautifulSoup:
    for selector in DETAIL_CONTAINER_SELECTORS:
        container = soup.select_one(selector)
        if container is not None:
            return container
    return soup


def extract_article_metadata(
    soup: BeautifulSoup,
    card: Tag,
    source_url: str,
    default_user_id: int | None,
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
) -> dict[str, Any]:
    page_title = first_match_text(soup, DETAIL_TITLE_SELECTORS) or first_match_text(card, [CARD_TITLE_SELECTOR])
    card_title = first_match_text(card, [CARD_TITLE_SELECTOR])
    card_author = clean_text(first_match_text(card, [CARD_AUTHOR_SELECTOR]).removeprefix("от "))
    article_author = first_meta_content(soup, DETAIL_META_AUTHOR_SELECTORS)
    author_value = clean_text(article_author or card_author or "Програмата")

    published_value = first_meta_content(soup, ['meta[property="article:published_time"]'])
    if not published_value:
        published_value = first_match_text(soup, ['time[datetime]'], attribute="datetime")
    published_date = ""
    published_time = "00:00:00"
    if published_value:
        try:
            parsed_published = datetime.fromisoformat(published_value.replace("Z", "+00:00"))
            published_date = parsed_published.date().isoformat()
            published_time = parsed_published.time().strftime("%H:%M:%S")
        except ValueError:
            published_value = clean_text(published_value)

    breadcrumb_parts: list[str] = []
    for selector in DETAIL_BREADCRUMB_SELECTORS:
        for element in soup.select(selector):
            text = clean_text(element.get_text(" ", strip=True))
            if text and text not in breadcrumb_parts:
                breadcrumb_parts.append(text)
    breadcrumb_text = " / ".join(breadcrumb_parts)
    image_value = first_meta_content(soup, DETAIL_META_IMAGE_SELECTORS) or extract_card_image(card, source_url)
    description_value = first_meta_content(soup, DETAIL_META_DESCRIPTION_SELECTORS)

    container = extract_article_container(soup)
    page_text = clean_text(container.get_text(" ", strip=True))
    category_id = resolve_programata_category_id(category_lookup, source_url, page_text, breadcrumb_text, card_title=card_title)
    region_id = resolve_programata_region_id(region_lookup, page_text, breadcrumb_text)
    user_id = default_user_id if default_user_id is not None else 1

    return {
        "source_url": source_url,
        "page_title": clean_text(page_title or card_title),
        "card_title": clean_text(card_title),
        "author": author_value,
        "published_date": published_date,
        "published_time": published_time,
        "breadcrumb_text": clean_text(breadcrumb_text),
        "page_text": page_text,
        "picture": clean_text(image_value) or None,
        "description": clean_text(description_value),
        "id_event_category": category_id,
        "id_region": region_id,
        "id_user": user_id,
        "year_hint": parsed_published.year if published_value and published_date else datetime.now().year,
    }


def collect_programata_blocks(container: Tag | BeautifulSoup, base_url: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    current_block: dict[str, Any] | None = None
    current_section = ""

    for element in container.find_all(["h2", "h3", "p"], recursive=True):
        text = clean_text(element.get_text(" ", strip=True))
        if not text:
            continue

        lowered = text.casefold()
        if lowered in STOP_SECTION_TITLES:
            break

        if element.name == "h2":
            current_section = text
            current_block = None
            continue

        if element.name == "h3":
            anchor = element.select_one("a[href]")
            raw_title = clean_text(anchor.get_text(" ", strip=True) if anchor is not None else text)
            if not raw_title or "прочети още" in raw_title.casefold():
                continue

            current_block = {
                "section": current_section,
                "title": strip_trailing_year(raw_title),
                "raw_title": raw_title,
                "url": urljoin(base_url, anchor.get("href", "") if anchor is not None else ""),
                "description_parts": [],
            }
            blocks.append(current_block)
            continue

        if element.name == "p":
            if current_block is None:
                continue
            current_block["description_parts"].append(text)

    return blocks


def build_programata_event_dict(
    block: dict[str, Any],
    metadata: dict[str, Any],
    base_url: str,
    category_lookup: dict[str, int],
) -> dict[str, Any] | None:
    description_parts = [clean_text(part) for part in block.get("description_parts", []) if clean_text(part)]
    schedule: dict[str, str] = {}
    remaining_description = description_parts[:]

    if remaining_description:
        first_line = remaining_description[0]
        try:
            schedule = parse_programata_schedule_line(first_line, metadata.get("year_hint"))
            remaining_description = remaining_description[1:]
        except ValueError:
            return None

    if not schedule:
        return None

    block_url = urljoin(base_url, block.get("url", "")) if block.get("url") else base_url
    combined_description = clean_text(" ".join(remaining_description))
    if not combined_description:
        combined_description = metadata.get("description", "")

    block_category_id = resolve_programata_category_id(
        category_lookup,
        base_url,
        metadata.get("page_text", ""),
        metadata.get("breadcrumb_text", ""),
        block.get("section", ""),
        block.get("title", ""),
    )

    event_dict = {
        "name_event": block.get("title") or metadata.get("page_title") or metadata.get("card_title") or "",
        "name_artist": metadata.get("author") or "Програмата",
        "place_event": schedule.get("place_event", ""),
        "id_event_category": block_category_id,
        "id_user": metadata["id_user"],
        "id_region": metadata["id_region"],
        "start_date": schedule["start_date"],
        "start_hour": schedule["start_hour"],
        "end_date": schedule["end_date"],
        "end_hour": schedule["end_hour"],
        "picture": metadata.get("picture"),
        "description": combined_description,
        "source_url": block_url,
        "section_title": block.get("section", ""),
        "card_title": metadata.get("card_title", ""),
    }

    if not event_dict["place_event"]:
        event_dict["place_event"] = schedule.get("place_event", "")

    event_dict["name_event"] = clean_text(strip_trailing_year(event_dict["name_event"]))
    event_dict["description"] = clean_text(event_dict["description"])
    event_dict["picture"] = clean_text(event_dict["picture"]) or None

    return event_dict


def build_programata_event_from_schedule(
    metadata: dict[str, Any],
    detail_url: str,
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
    schedule: dict[str, str],
    place_event: str = "",
    section_title: str = "",
    title_override: str | None = None,
) -> dict[str, Any]:
    event_name = clean_text(title_override or metadata.get("page_title") or metadata.get("card_title") or "")
    description_value = clean_text(metadata.get("description", "") or metadata.get("page_text", ""))
    place_value = clean_text(place_event or schedule.get("place_event", ""))

    event_dict = {
        "name_event": clean_text(strip_trailing_year(event_name)),
        "name_artist": metadata.get("author") or "Програмата",
        "place_event": place_value,
        "id_event_category": resolve_programata_category_id(
            category_lookup,
            detail_url,
            metadata.get("page_text", ""),
            metadata.get("breadcrumb_text", ""),
            section_title,
            event_name,
        ),
        "id_user": metadata["id_user"],
        "id_region": resolve_programata_region_id(region_lookup, metadata.get("page_text", ""), place_value),
        "start_date": schedule["start_date"],
        "start_hour": schedule["start_hour"],
        "end_date": schedule["end_date"],
        "end_hour": schedule["end_hour"],
        "picture": metadata.get("picture"),
        "description": description_value,
        "source_url": detail_url,
        "section_title": section_title or metadata.get("breadcrumb_text", ""),
        "card_title": metadata.get("card_title", ""),
    }

    event_dict["picture"] = clean_text(event_dict["picture"]) or None
    return event_dict


def extract_programata_events_from_page_text(
    metadata: dict[str, Any],
    detail_url: str,
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
) -> list[dict[str, Any]]:
    page_text = metadata.get("page_text", "")
    candidate_events: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()

    def append_event(schedule: dict[str, str], place_event: str = "", section_title: str = "", title_override: str | None = None) -> None:
        event_dict = build_programata_event_from_schedule(
            metadata,
            detail_url,
            category_lookup,
            region_lookup,
            schedule,
            place_event=place_event,
            section_title=section_title,
            title_override=title_override,
        )
        dedupe_key = (
            event_dict["name_event"],
            event_dict["name_artist"],
            event_dict["place_event"],
            event_dict["id_event_category"],
            event_dict["id_user"],
            event_dict["id_region"],
            event_dict["start_date"],
            event_dict["start_hour"],
            event_dict["end_date"],
            event_dict["end_hour"],
        )
        if dedupe_key in seen_keys:
            return
        seen_keys.add(dedupe_key)
        candidate_events.append(event_dict)

    for match in NUMERIC_SCHEDULE_RE.finditer(page_text):
        schedule = {
            "start_date": parse_date_value(match.group("start_date")),
            "start_hour": parse_time_value(match.group("time")),
            "end_date": parse_date_value(match.group("start_date")),
            "end_hour": parse_time_value(match.group("time")),
            "place_event": clean_text(match.group("place")),
        }
        city_value = clean_text(match.group("city"))
        place_value = schedule["place_event"]
        if city_value and place_value.lower().startswith(city_value.lower() + ","):
            schedule["place_event"] = clean_text(place_value[len(city_value):].lstrip(", "))
        append_event(schedule, place_event=schedule["place_event"])

    for match in CITY_MONTH_RANGE_RE.finditer(page_text):
        schedule = {
            "start_date": parse_bulgarian_date_range(
                f"{match.group('start_day')} {match.group('start_month')} {match.group('start_year')}",
                metadata.get("year_hint"),
            )[0],
            "start_hour": "00:00:00",
            "end_date": parse_bulgarian_date_range(
                f"{match.group('end_day')} {match.group('end_month')} {match.group('end_year')}",
                metadata.get("year_hint"),
            )[0],
            "end_hour": "00:00:00",
            "place_event": clean_text(match.group("place")),
        }
        append_event(schedule, place_event=schedule["place_event"], section_title=clean_text(match.group("city")))

    for match in CITY_MONTH_TIME_RE.finditer(page_text):
        schedule = {
            "start_date": parse_bulgarian_date_range(
                f"{match.group('day')} {match.group('month')} {match.group('year') or metadata.get('year_hint')}",
                metadata.get("year_hint"),
            )[0],
            "start_hour": parse_time_value(match.group("time") or "00:00"),
            "end_date": parse_bulgarian_date_range(
                f"{match.group('day')} {match.group('month')} {match.group('year') or metadata.get('year_hint')}",
                metadata.get("year_hint"),
            )[1],
            "end_hour": parse_time_value(match.group("time") or "00:00"),
            "place_event": clean_text(match.group("place")),
        }
        append_event(schedule, place_event=schedule["place_event"], section_title=clean_text(match.group("city")))

    for match in DATE_RANGE_TEXT_RE.finditer(page_text):
        schedule = {
            "start_date": parse_bulgarian_date_range(
                f"{match.group('start_day')} {match.group('month')} {match.group('year') or metadata.get('year_hint')}",
                metadata.get("year_hint"),
            )[0],
            "start_hour": "00:00:00",
            "end_date": parse_bulgarian_date_range(
                f"{match.group('end_day')} {match.group('month')} {match.group('year') or metadata.get('year_hint')}",
                metadata.get("year_hint"),
            )[0],
            "end_hour": "00:00:00",
            "place_event": clean_text(match.group("place")),
        }
        append_event(schedule, place_event=schedule["place_event"])

    for match in SIMPLE_DATE_TEXT_RE.finditer(page_text):
        schedule = {
            "start_date": parse_bulgarian_date_range(
                f"{match.group('day')} {match.group('month')} {match.group('year') or metadata.get('year_hint')}",
                metadata.get("year_hint"),
            )[0],
            "start_hour": parse_time_value(match.group("time") or "00:00"),
            "end_date": parse_bulgarian_date_range(
                f"{match.group('day')} {match.group('month')} {match.group('year') or metadata.get('year_hint')}",
                metadata.get("year_hint"),
            )[1],
            "end_hour": parse_time_value(match.group("time") or "00:00"),
            "place_event": clean_text(match.group("place")),
        }
        append_event(schedule, place_event=schedule["place_event"])

    return candidate_events


def is_event_in_past(event: dict[str, Any]) -> bool:
    start_date = event_value(event, "start_date")
    start_hour = event_value(event, "start_hour")

    if not start_date or not start_hour:
        return True

    try:
        start_datetime = datetime.strptime(f"{start_date} {start_hour}", "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return True

    return start_datetime < datetime.now()


def parse_event_card(
    card: Tag,
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_url: str | None = None,
) -> list[dict[str, Any]]:
    detail_url = extract_card_href(card, source_url)
    card_title = clean_text(first_match_text(card, [CARD_TITLE_SELECTOR]))
    card_author = clean_text(first_match_text(card, [CARD_AUTHOR_SELECTOR]).removeprefix("от "))
    card_image = extract_card_image(card, source_url)

    if not detail_url:
        logger.warning("Skipping card without detail URL: %s", card_title)
        return []

    try:
        html = fetch_html(detail_url)
    except RequestException as exc:
        logger.warning("Falling back to card-only parsing for %s: %s", detail_url, exc)
        return []

    soup = BeautifulSoup(html, "html.parser")
    metadata = extract_article_metadata(
        soup,
        card,
        detail_url,
        default_user_id,
        category_lookup,
        region_lookup,
    )

    container = extract_article_container(soup)
    blocks = collect_programata_blocks(container, detail_url)

    if not blocks:
        page_title = metadata.get("page_title") or card_title
        try:
            schedule = parse_programata_schedule_line(page_title, metadata.get("year_hint"))
        except ValueError:
            schedule = None

        if schedule is None:
            fallback_events = extract_programata_events_from_page_text(
                metadata,
                detail_url,
                category_lookup,
                region_lookup,
            )
            return [event for event in fallback_events if not is_event_in_past(event)]

        fallback_event = {
            "name_event": strip_trailing_year(page_title),
            "name_artist": metadata.get("author") or card_author or "Програмата",
            "place_event": "",
            "id_event_category": metadata["id_event_category"],
            "id_user": metadata["id_user"],
            "id_region": metadata["id_region"],
            "start_date": schedule["start_date"],
            "start_hour": schedule["start_hour"],
            "end_date": schedule["end_date"],
            "end_hour": schedule["end_hour"],
            "picture": metadata.get("picture") or card_image or None,
            "description": metadata.get("description", ""),
            "source_url": detail_url,
            "section_title": metadata.get("breadcrumb_text", ""),
            "card_title": card_title,
        }

        if is_event_in_past(fallback_event):
                        return []
        return [fallback_event]

    events: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()

    for block in blocks:
        event_dict = build_programata_event_dict(block, metadata, detail_url, category_lookup)
        if event_dict is None:
            continue
        if is_event_in_past(event_dict):
            logger.info("Skipping past event: %s", event_value(event_dict, "name_event"))
            continue
        dedupe_key = (
            event_dict["name_event"],
            event_dict["name_artist"],
            event_dict["place_event"],
            event_dict["id_event_category"],
            event_dict["id_user"],
            event_dict["id_region"],
            event_dict["start_date"],
            event_dict["start_hour"],
            event_dict["end_date"],
            event_dict["end_hour"],
        )
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        events.append(event_dict)

    if events:
        return events

    fallback_events = extract_programata_events_from_page_text(
        metadata,
        detail_url,
        category_lookup,
        region_lookup,
    )
    return [event for event in fallback_events if not is_event_in_past(event)]


def parse_events(
    html: str,
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_url: str | None = None,
) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(EVENT_CARD_SELECTOR)

    records: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()

    for index, card in enumerate(cards, start=1):
        if not isinstance(card, Tag):
            continue
        try:
            parsed_events = parse_event_card(card, region_lookup, category_lookup, default_user_id, source_url)
            for event in parsed_events:
                if is_event_in_past(event):
                    continue
                dedupe_key = (
                    event["name_event"],
                    event["name_artist"],
                    event["place_event"],
                    event["id_event_category"],
                    event["id_user"],
                    event["id_region"],
                    event["start_date"],
                    event["start_hour"],
                    event["end_date"],
                    event["end_hour"],
                )
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                records.append(event)
        except ValueError as exc:
            logger.warning("Skipping card %s: %s", index, exc)

    return records


def fetch_html(url: str, timeout_seconds: int = 30) -> str:
    try:
        response = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CulturoBG-Scraper/1.0",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
            },
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        return response.text
    except RequestException as exc:
        logger.error("Failed to fetch %s: %s", url, exc)
        raise


def event_value(event: dict[str, Any], key: str, default: Any = "") -> Any:
    value = event.get(key, default)
    if value is None:
        return default
    return value


def build_event_payload(event: dict[str, Any]) -> dict[str, Any]:
    return {key: event_value(event, key) for key in EVENT_PAYLOAD_KEYS}


def resolve_default_user_id(client: Client, explicit_user_id: int | None) -> int:
    if explicit_user_id is not None:
        return explicit_user_id

    session = client.auth.get_session()
    auth_user_id = getattr(getattr(session, "user", None), "id", None)

    if auth_user_id:
        response = (
            client.table("users")
            .select("id_user")
            .eq("auth_user_id", auth_user_id)
            .maybe_single()
            .execute()
        )
        if response.data:
            return int(response.data["id_user"])

    return 1


def create_supabase_client() -> Client:
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

    if not supabase_url or not service_key:
        anon_key = os.environ.get("SUPABASE_ANON_KEY")
        auth_email = os.environ.get("SCRAPER_AUTH_EMAIL")
        auth_password = os.environ.get("SCRAPER_AUTH_PASSWORD")

        if not supabase_url:
            raise RuntimeError("Set SUPABASE_URL before running the scraper.")

        if not anon_key:
            raise RuntimeError(
                "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY before running the scraper."
            )

        if not auth_email or not auth_password:
            raise RuntimeError(
                "Set SCRAPER_AUTH_EMAIL and SCRAPER_AUTH_PASSWORD when using SUPABASE_ANON_KEY."
            )

        client = create_client(supabase_url, anon_key)
        client.auth.sign_in_with_password({"email": auth_email, "password": auth_password})

        session = client.auth.get_session()
        if session is None:
            raise RuntimeError("Supabase login succeeded but no session was created.")

        return client

    return create_client(supabase_url, service_key)


def verify_supabase_connection(client: Client) -> None:
    try:
        client.table("regions").select("id_region").limit(1).execute()
    except Exception as exc:
        raise RuntimeError(f"Could not connect to Supabase: {exc}") from exc


def find_existing_event_id(client: Client, event: dict[str, Any]) -> int | None:
    query = (
        client.table("events")
        .select("id_event")
        .eq("name_event", event_value(event, "name_event"))
        .eq("name_artist", event_value(event, "name_artist"))
        .eq("place_event", event_value(event, "place_event"))
        .eq("id_event_category", event_value(event, "id_event_category"))
        .eq("id_user", event_value(event, "id_user"))
        .eq("id_region", event_value(event, "id_region"))
        .eq("start_date", event_value(event, "start_date"))
        .eq("start_hour", event_value(event, "start_hour"))
        .eq("end_date", event_value(event, "end_date"))
        .eq("end_hour", event_value(event, "end_hour"))
        .limit(1)
    )
    response = query.execute()
    rows = response.data or []
    if not rows:
        return None
    return int(rows[0]["id_event"])


def upsert_event(client: Client, event: dict[str, Any]) -> dict[str, Any]:
    payload = build_event_payload(event)
    existing_id = find_existing_event_id(client, event)

    try:
        if existing_id is None:
            response = client.table("events").insert(payload).execute()
            logger.info("Inserted event: %s", event_value(event, "name_event"))
        else:
            response = client.table("events").update(payload).eq("id_event", existing_id).execute()
            logger.info("Updated event %s: %s", existing_id, event_value(event, "name_event"))
    except Exception as exc:  # supabase-py raises multiple exception types depending on the failure.
        logger.error("Failed to upsert event '%s': %s", event_value(event, "name_event"), exc)
        raise

    if response.data:
        return response.data[0]
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape events and save them to Supabase.")
    parser.add_argument(
        "--url",
        default=os.environ.get("SCRAPER_SOURCE_URL") or PROGRAMATA_DEFAULT_SOURCE_URL,
        help="Events page URL (defaults to Programata.bg homepage)",
    )
    parser.add_argument(
        "--default-user-id",
        type=int,
        default=int(os.environ["SCRAPER_DEFAULT_USER_ID"]) if os.environ.get("SCRAPER_DEFAULT_USER_ID") else None,
        help="Fallback id_user for imported events",
    )
    args = parser.parse_args()

    try:
        client = create_supabase_client()
        verify_supabase_connection(client)
        region_lookup, category_lookup = load_lookup_maps(client)
        default_user_id = resolve_default_user_id(client, args.default_user_id)

        html = fetch_html(args.url)
        events = parse_events(html, region_lookup, category_lookup, default_user_id, args.url)

        if not events:
            logger.warning("No events found on the page.")
            return 0

        processed = 0
        for event in events:
            upsert_event(client, event)
            processed += 1

        logger.info("Processed %s events.", processed)
        return 0
    except Exception as exc:
        logger.error("Scraper failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())