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
from datetime import date, datetime
from functools import lru_cache
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag
from requests import RequestException
from supabase import Client, create_client

from shared_source import SOURCE_IDENTITY_FIELDS, stamp_source_identity


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
PROGRAMATA_SOURCE_NAME = "programata"
GOOGLE_REGION_LOOKUP_ENABLED = os.environ.get("SCRAPER_REGION_LOOKUP_GOOGLE", "1").strip().casefold() in {
    "1",
    "true",
    "yes",
    "on",
}
GOOGLE_REGION_LOOKUP_TIMEOUT_SECONDS = 8
GOOGLE_SEARCH_URL = "https://www.google.com/search"

PROGRAMATA_PATH_CATEGORY_HINTS = [
    ("/kino/", "Кино"),
    ("/muzika/", "Концерти"),
    ("/stsena/", "Театър"),
    ("/izlozhbi/", "Фестивали"),
    ("/literatura/", "Фестивали"),
    ("/gradat/", "Фестивали"),
]

EVENT_PAYLOAD_KEYS = [
    "source_name",
    "source_event_key",
    "source_url",
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

SOURCE_IDENTITY_COLUMNS_AVAILABLE: bool | None = None

SCHEDULE_LINE_RE = re.compile(
    r"^(?P<start_day>\d{1,2})(?:\s*[-–]\s*(?P<end_day>\d{1,2}))?\s+(?P<month>[А-Яа-я]+)(?:\s+(?P<year>\d{4}))?(?:\s*,\s*(?P<time>\d{1,2}:\d{2})(?:\s*ч\.?))?(?:\s*,\s*(?P<place>.+))?$",
    re.IGNORECASE,
)

DATE_RANGE_RE = re.compile(
    r"(?P<start_day>\d{1,2})(?:\s*[-–]\s*(?P<end_day>\d{1,2}))?\s+(?P<month>[А-Яа-я]+)(?:\s+(?P<year>\d{4}))?",
    re.IGNORECASE,
)

NUMERIC_SCHEDULE_RE = re.compile(
    r'''(?P<start_date>\d{2}\.\d{2}\.\d{4})(?:\s*\([^)]+\))?\s*[–-]\s*(?P<time>\d{1,2}:\d{2})(?:\s*ч\.?)?\s*[–-]\s*(?P<city>[А-ЯA-ZА-Яа-яЁё„“"'\-\. ]{2,60}?),\s*(?P<place>.+?)(?=(?:\s+\d{2}\.\d{2}\.\d{4})|$)''',
    re.IGNORECASE,
)

CITY_MONTH_RANGE_RE = re.compile(
    rf'''(?P<city>[А-ЯA-ZА-Яа-яЁё„“"'\-\. ]{{2,60}}?)\s+(?P<start_day>\d{{1,2}})\s+(?P<start_month>{BULGARIAN_MONTH_PATTERN})\s+(?P<start_year>\d{{4}})\s*[–-]\s*(?P<end_day>\d{{1,2}})\s+(?P<end_month>{BULGARIAN_MONTH_PATTERN})\s+(?P<end_year>\d{{4}})(?:\s*[–-]\s*(?P<place>.+?))?(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))''',
    re.IGNORECASE,
)

CITY_MONTH_TIME_RE = re.compile(
    rf'''(?P<city>[А-ЯA-ZА-Яа-яЁё„“"'\-\. ]{{2,60}}?)\s+(?P<day>\d{{1,2}})\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:,\s*(?P<time>\d{{1,2}}:\d{{2}})(?:\s*ч\.?)?)?\s*[–-]\s*(?P<place>.+?)(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))''',
    re.IGNORECASE,
)

DATE_RANGE_TEXT_RE = re.compile(
    rf"(?P<start_day>\d{{1,2}})\s*(?:и|[-–])\s*(?P<end_day>\d{{1,2}})\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:\s*(?:в|на)\s+(?P<place>.+?))?(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))",
    re.IGNORECASE,
)

SIMPLE_DATE_TEXT_RE = re.compile(
    rf"(?:на\s+)?(?P<day>\d{{1,2}})\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:,\s*(?P<time>\d{{1,2}}:\d{{2}})(?:\s*ч\.?)?)?(?:\s*(?:в|на)\s+(?P<place>.+?))?(?=(?:\s+[А-ЯA-ZА-Яа-яЁё]{{2,}}|\s*$))",
    re.IGNORECASE,
)

PROGRAMATA_LINE_SCHEDULE_RE = re.compile(
    rf"^(?P<start_day>\d{{1,2}})(?:\s*[-–]\s*(?P<end_day>\d{{1,2}}))?\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?(?:\s*[,:\-–]\s*(?P<time>\d{{1,2}}:\d{{2}})(?:\s*ч\.?)?)?(?:\s*(?:\((?P<paren_place>.+?)\)|,\s*(?P<place>.+)))?$",
    re.IGNORECASE,
)

PROGRAMATA_DATE_ONLY_LINE_RE = re.compile(
    rf"^(?P<start_day>\d{{1,2}})(?:\s*[-–]\s*(?P<end_day>\d{{1,2}}))?\s+(?P<month>{BULGARIAN_MONTH_PATTERN})(?:\s+(?P<year>\d{{4}}))?:?$",
    re.IGNORECASE,
)

PROGRAMATA_TIME_ONLY_LINE_RE = re.compile(
    r"^(?P<time>\d{1,2}:\d{2})(?:\s*ч\.?)?(?:\s*\((?P<place>.+?)\))?$",
    re.IGNORECASE,
)

PROGRAMATA_IGNORED_CONTEXT_LINES = {
    "Начало",
    "Сцена",
    "Постановки",
    "Опера, Балет, Танц",
    "Опера и оперета",
    "Кино",
    "Музика",
    "Изложби",
    "Литература",
    "Градът",
}


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


def normalize_region_key(value: str) -> str:
    normalized_value = normalize_lookup_key(value)
    normalized_value = normalized_value.replace("–", " ").replace("-", " ")
    normalized_value = re.sub(r"[.,;:/()\"'“”„]+", " ", normalized_value)
    normalized_value = re.sub(r"\s+", " ", normalized_value)
    return normalized_value.strip()


def lookup_region_id_by_names(region_lookup: dict[str, int], candidate_names: list[str]) -> int | None:
    normalized_candidates = [normalize_region_key(candidate) for candidate in candidate_names if clean_text(candidate)]
    if not normalized_candidates:
        return None

    for region_name, region_id in region_lookup.items():
        normalized_region_name = normalize_region_key(region_name)
        for candidate_name in normalized_candidates:
            if normalized_region_name == candidate_name:
                return region_id
            if candidate_name in normalized_region_name:
                return region_id
            if normalized_region_name in candidate_name:
                return region_id

    return None


def build_region_alias_lookup(region_lookup: dict[str, int]) -> dict[str, int]:
    alias_lookup: dict[str, int] = {}

    for region_name, region_id in region_lookup.items():
        normalized_region_name = normalize_region_key(region_name)
        if normalized_region_name:
            alias_lookup[normalized_region_name] = region_id

    sofia_city_id = lookup_region_id_by_names(
        region_lookup,
        [
            "София – град",
            "София - град",
            "София-град",
            "София град",
            "София",
            "гр. София",
            "гр София",
            "Столицата",
        ],
    )
    if sofia_city_id is not None:
        for alias in ["София", "гр. София", "гр София", "София град", "София-град", "Столицата"]:
            alias_lookup[normalize_region_key(alias)] = sofia_city_id

    sofia_oblast_id = lookup_region_id_by_names(
        region_lookup,
        ["Софийска област", "София област", "Област София", "обл. София", "обл София"],
    )
    if sofia_oblast_id is not None:
        for alias in ["Софийска област", "София област", "Област София", "обл. София", "обл София"]:
            alias_lookup[normalize_region_key(alias)] = sofia_oblast_id

    return alias_lookup


def resolve_region_id_from_text(text: str, alias_lookup: dict[str, int]) -> int | None:
    normalized_text = normalize_region_key(text)
    if not normalized_text:
        return None

    ordered_aliases = sorted(alias_lookup.items(), key=lambda item: len(item[0]), reverse=True)
    for alias, region_id in ordered_aliases:
        if alias and alias in normalized_text:
            return region_id

    return None


@lru_cache(maxsize=256)
def fetch_google_region_text(query_text: str) -> str:
    cleaned_query = clean_text(query_text)
    if not cleaned_query:
        return ""

    response = requests.get(
        GOOGLE_SEARCH_URL,
        params={"q": cleaned_query, "hl": "bg", "gl": "bg", "num": "5"},
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CulturoBG-Scraper/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
        },
        timeout=GOOGLE_REGION_LOOKUP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    page_text = response.text.casefold()
    if "unusual traffic" in page_text or "необичаен трафик" in page_text:
        return ""

    return clean_text(BeautifulSoup(response.text, "html.parser").get_text(" ", strip=True))


def resolve_region_id_via_google(query_text: str, alias_lookup: dict[str, int]) -> int | None:
    if not GOOGLE_REGION_LOOKUP_ENABLED:
        return None

    cleaned_query = clean_text(query_text)
    if not cleaned_query:
        return None

    try:
        google_text = fetch_google_region_text(cleaned_query)
    except RequestException as exc:
        logger.debug("Google region lookup failed for %s: %s", cleaned_query, exc)
        return None

    return resolve_region_id_from_text(google_text, alias_lookup)


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


def load_existing_programata_events(client: Client) -> list[dict[str, Any]]:
    global SOURCE_IDENTITY_COLUMNS_AVAILABLE

    try:
        response = (
            client.table("events")
            .select("id_event, source_name, source_event_key, source_url, name_event, name_artist, place_event, id_event_category, id_user, id_region, start_date, start_hour, end_date, end_hour, description, picture")
            .execute()
        )
        SOURCE_IDENTITY_COLUMNS_AVAILABLE = True
        return response.data or []
    except Exception as exc:
        if not is_missing_source_identity_column_error(exc):
            raise

    SOURCE_IDENTITY_COLUMNS_AVAILABLE = False
    response = (
        client.table("events")
        .select("id_event, name_event, name_artist, place_event, id_event_category, id_user, id_region, start_date, start_hour, end_date, end_hour, description, picture")
        .execute()
    )
    return response.data or []


def source_identity_columns_supported() -> bool:
    return SOURCE_IDENTITY_COLUMNS_AVAILABLE is not False


def apply_programata_source_identity(event_dict: dict[str, Any], source_key: str) -> dict[str, Any]:
    return stamp_source_identity(event_dict, PROGRAMATA_SOURCE_NAME, source_key, event_dict.get("source_url"))


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


def extract_programata_content_text(container: Tag | BeautifulSoup) -> str:
    content_parts: list[str] = []
    for raw_line in container.get_text("\n", strip=True).splitlines():
        text = clean_text(raw_line)
        if not text:
            continue

        if text.casefold() in STOP_SECTION_TITLES:
            break

        content_parts.append(text)

    return clean_text(" ".join(content_parts))


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


def parse_programata_line_schedule(value: str, year_hint: int | None = None) -> dict[str, str]:
    cleaned_value = clean_text(value)
    match = PROGRAMATA_LINE_SCHEDULE_RE.fullmatch(cleaned_value)
    if match is None:
        raise ValueError(f"Unsupported schedule line: {value}")

    current_year = datetime.now().year
    year_value = int(match.group("year") or year_hint or current_year)
    if match.group("year") is None and year_value < current_year:
        year_value = current_year
    month_value = parse_bulgarian_month(match.group("month"))
    start_day = int(match.group("start_day"))
    end_day = int(match.group("end_day") or start_day)
    start_date = datetime(year_value, month_value, start_day).date().isoformat()
    end_date = datetime(year_value, month_value, end_day).date().isoformat()
    time_value = match.group("time") or "00:00"
    place_value = clean_text(match.group("place") or match.group("paren_place") or "")

    return {
        "start_date": start_date,
        "start_hour": parse_time_value(time_value),
        "end_date": end_date,
        "end_hour": parse_time_value(time_value),
        "place_event": place_value,
    }


def parse_programata_heading_schedule_line(value: str, year_hint: int | None = None) -> dict[str, str]:
    cleaned_value = clean_text(value)
    if not cleaned_value:
        raise ValueError("Missing schedule value")

    numeric_match = NUMERIC_SCHEDULE_RE.fullmatch(cleaned_value)
    if numeric_match is not None:
        place_value = clean_text(numeric_match.group("place"))
        city_value = clean_text(numeric_match.group("city"))
        if city_value and place_value.lower().startswith(city_value.lower() + ","):
            place_value = clean_text(place_value[len(city_value):].lstrip(", "))

        return {
            "start_date": parse_date_value(numeric_match.group("start_date")),
            "start_hour": parse_time_value(numeric_match.group("time")),
            "end_date": parse_date_value(numeric_match.group("start_date")),
            "end_hour": parse_time_value(numeric_match.group("time")),
            "place_event": place_value,
            "region_hint": city_value,
        }

    city_month_time_match = CITY_MONTH_TIME_RE.fullmatch(cleaned_value)
    if city_month_time_match is not None:
        year_value = int(city_month_time_match.group("year") or year_hint or datetime.now().year)
        month_value = parse_bulgarian_month(city_month_time_match.group("month"))
        day_value = int(city_month_time_match.group("day"))
        start_date = datetime(year_value, month_value, day_value).date().isoformat()
        start_hour = parse_time_value(city_month_time_match.group("time") or "00:00")
        place_value = clean_text(city_month_time_match.group("place"))
        return {
            "start_date": start_date,
            "start_hour": start_hour,
            "end_date": start_date,
            "end_hour": start_hour,
            "place_event": place_value,
            "region_hint": clean_text(city_month_time_match.group("city")),
        }

    city_month_range_match = CITY_MONTH_RANGE_RE.fullmatch(cleaned_value)
    if city_month_range_match is not None:
        start_date = datetime(
            int(city_month_range_match.group("start_year") or year_hint or datetime.now().year),
            parse_bulgarian_month(city_month_range_match.group("start_month")),
            int(city_month_range_match.group("start_day")),
        ).date().isoformat()
        end_date = datetime(
            int(city_month_range_match.group("end_year") or year_hint or datetime.now().year),
            parse_bulgarian_month(city_month_range_match.group("end_month")),
            int(city_month_range_match.group("end_day")),
        ).date().isoformat()
        return {
            "start_date": start_date,
            "start_hour": "00:00:00",
            "end_date": end_date,
            "end_hour": "00:00:00",
            "place_event": clean_text(city_month_range_match.group("place")),
            "region_hint": clean_text(city_month_range_match.group("city")),
        }

    date_range_text_match = DATE_RANGE_TEXT_RE.fullmatch(cleaned_value)
    if date_range_text_match is not None:
        start_date = datetime(
            int(date_range_text_match.group("year") or year_hint or datetime.now().year),
            parse_bulgarian_month(date_range_text_match.group("month")),
            int(date_range_text_match.group("start_day")),
        ).date().isoformat()
        end_date = datetime(
            int(date_range_text_match.group("year") or year_hint or datetime.now().year),
            parse_bulgarian_month(date_range_text_match.group("month")),
            int(date_range_text_match.group("end_day")),
        ).date().isoformat()
        return {
            "start_date": start_date,
            "start_hour": "00:00:00",
            "end_date": end_date,
            "end_hour": "00:00:00",
            "place_event": clean_text(date_range_text_match.group("place")),
            "region_hint": "",
        }

    simple_date_text_match = SIMPLE_DATE_TEXT_RE.fullmatch(cleaned_value)
    if simple_date_text_match is not None:
        year_value = int(simple_date_text_match.group("year") or year_hint or datetime.now().year)
        month_value = parse_bulgarian_month(simple_date_text_match.group("month"))
        day_value = int(simple_date_text_match.group("day"))
        start_date = datetime(year_value, month_value, day_value).date().isoformat()
        start_hour = parse_time_value(simple_date_text_match.group("time") or "00:00")
        place_value = clean_text(simple_date_text_match.group("place"))
        return {
            "start_date": start_date,
            "start_hour": start_hour,
            "end_date": start_date,
            "end_hour": start_hour,
            "place_event": place_value,
            "region_hint": "",
        }

    return parse_programata_schedule_line(cleaned_value, year_hint)


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
    place_text_value = clean_text(place_text)
    page_text_value = clean_text(page_text)
    fallback_region_id = region_lookup.get(normalize_lookup_key(PROGRAMATA_DEFAULT_REGION_NAME)) or 0
    alias_lookup = build_region_alias_lookup(region_lookup)

    for text_value in [place_text_value, page_text_value]:
        region_id = resolve_region_id_from_text(text_value, alias_lookup)
        if region_id is not None:
            return region_id

    google_query_text = place_text_value or page_text_value
    google_region_id = resolve_region_id_via_google(google_query_text, alias_lookup)
    if google_region_id is not None:
        return google_region_id

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
    page_text = extract_programata_content_text(container)
    category_id = resolve_programata_category_id(category_lookup, source_url, page_text, breadcrumb_text, card_title=card_title)
    region_location_text = " ".join(part for part in [page_text, breadcrumb_text, page_title, card_title] if part)
    region_id = resolve_programata_region_id(region_lookup, region_location_text)
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

        if element.name in {"h4", "h5", "p"}:
            if current_block is None:
                continue
            current_block["description_parts"].append(text)

    return blocks


def build_programata_event_dict(
    block: dict[str, Any],
    metadata: dict[str, Any],
    base_url: str,
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
) -> list[dict[str, Any]] | None:
    description_parts = [clean_text(part) for part in block.get("description_parts", []) if clean_text(part)]
    if not description_parts:
        return None

    block_url = urljoin(base_url, block.get("url", "")) if block.get("url") else base_url
    block_category_id = resolve_programata_category_id(
        category_lookup,
        base_url,
        metadata.get("page_text", ""),
        metadata.get("breadcrumb_text", ""),
        block.get("section", ""),
        block.get("title", ""),
    )

    intro_parts: list[str] = []
    current_schedule: dict[str, Any] | None = None
    current_description_parts: list[str] = []
    events: list[dict[str, Any]] = []

    def finalize_event(schedule: dict[str, str], description_chunks: list[str]) -> None:
        combined_description = clean_text(" ".join(description_chunks))
        if not combined_description:
            combined_description = metadata.get("description", "")
        region_context_text = " ".join(
            part
            for part in [
                metadata.get("page_text", ""),
                metadata.get("breadcrumb_text", ""),
                block.get("section", ""),
                block.get("title", ""),
                combined_description,
            ]
            if part
        )

        event_dict = {
            "name_event": block.get("title") or metadata.get("page_title") or metadata.get("card_title") or "",
            "name_artist": metadata.get("author") or "Програмата",
            "place_event": schedule.get("place_event", ""),
            "id_event_category": block_category_id,
            "id_user": metadata["id_user"],
            "id_region": resolve_programata_region_id(region_lookup, region_context_text, schedule.get("place_event", "")),
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
        events.append(apply_programata_source_identity(event_dict, block_url))

    for part in description_parts:
        try:
            schedule = parse_programata_schedule_line(part, metadata.get("year_hint"))
        except ValueError:
            if current_schedule is None:
                intro_parts.append(part)
            else:
                current_description_parts.append(part)
            continue

        if current_schedule is not None:
            finalize_event(current_schedule, current_description_parts)

        current_schedule = schedule
        current_description_parts = intro_parts[:]

    if current_schedule is None:
        return None

    finalize_event(current_schedule, current_description_parts)
    return events


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
    region_hint_value = clean_text(schedule.get("region_hint", ""))
    region_lookup_text = " ".join(
        part
        for part in [
            region_hint_value,
            place_value,
            metadata.get("page_text", ""),
            metadata.get("breadcrumb_text", ""),
            section_title,
            event_name,
            description_value,
        ]
        if part
    )

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
        "id_region": resolve_programata_region_id(region_lookup, region_lookup_text, place_value),
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
    return apply_programata_source_identity(event_dict, detail_url)


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


def extract_programata_events_from_line_schedule(
    container: Tag | BeautifulSoup,
    metadata: dict[str, Any],
    detail_url: str,
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
) -> list[dict[str, Any]]:
    lines = [clean_text(line) for line in container.get_text("\n", strip=True).splitlines()]
    lines = [line for line in lines if line]

    candidate_events: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()
    page_title = clean_text(metadata.get("page_title") or metadata.get("card_title") or "")
    last_place_context = ""
    found_schedule = False

    def append_event(schedule: dict[str, str], place_event: str) -> None:
        event_dict = build_programata_event_from_schedule(
            metadata,
            detail_url,
            category_lookup,
            region_lookup,
            schedule,
            place_event=place_event,
            section_title=metadata.get("breadcrumb_text", ""),
            title_override=page_title,
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

    index = 0
    while index < len(lines):
        line = lines[index]
        lowered = line.casefold()

        if lowered in STOP_SECTION_TITLES:
            break

        if line in PROGRAMATA_IGNORED_CONTEXT_LINES:
            index += 1
            continue

        if line.startswith("Прочети още"):
            index += 1
            continue

        schedule: dict[str, str] | None = None
        advance_by = 1

        if PROGRAMATA_DATE_ONLY_LINE_RE.fullmatch(line):
            next_line = lines[index + 1] if index + 1 < len(lines) else ""
            next_time = PROGRAMATA_TIME_ONLY_LINE_RE.fullmatch(next_line)
            if next_time is not None:
                combined_value = f"{line.rstrip(':')}, {next_time.group('time')}"
                if next_time.group("place"):
                    combined_value += f", {next_time.group('place')}"
                try:
                    schedule = parse_programata_line_schedule(combined_value, metadata.get("year_hint"))
                    advance_by = 2
                except ValueError:
                    schedule = None
            else:
                try:
                    schedule = parse_programata_line_schedule(line, metadata.get("year_hint"))
                except ValueError:
                    schedule = None
        else:
            try:
                schedule = parse_programata_line_schedule(line, metadata.get("year_hint"))
            except ValueError:
                schedule = None

        if schedule is not None:
            found_schedule = True
            place_event = schedule.get("place_event") or last_place_context
            append_event(schedule, place_event)
            index += advance_by
            continue

        if not found_schedule:
            if line != page_title and not line.endswith("| Програмата"):
                last_place_context = line

        index += 1

    return candidate_events


def extract_programata_events_from_heading_schedule(
    container: Tag | BeautifulSoup,
    metadata: dict[str, Any],
    detail_url: str,
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
) -> list[dict[str, Any]]:
    page_title = clean_text(metadata.get("page_title") or metadata.get("card_title") or "")
    intro_parts: list[str] = []
    current_schedule: dict[str, str] | None = None
    current_description_parts: list[str] = []
    events: list[dict[str, Any]] = []

    def finalize_event(schedule: dict[str, str], description_chunks: list[str]) -> None:
        event_dict = build_programata_event_from_schedule(
            metadata,
            detail_url,
            category_lookup,
            region_lookup,
            schedule,
            place_event=schedule.get("place_event", ""),
            section_title=metadata.get("breadcrumb_text", ""),
            title_override=page_title,
        )
        if description_chunks:
            event_dict["description"] = clean_text(" ".join(description_chunks)) or event_dict["description"]
        events.append(event_dict)

    for element in container.find_all(["h4", "h5", "p"], recursive=True):
        text = clean_text(element.get_text(" ", strip=True))
        if not text:
            continue

        lowered = text.casefold()
        if lowered in STOP_SECTION_TITLES:
            break

        try:
            schedule = parse_programata_heading_schedule_line(text, metadata.get("year_hint"))
        except ValueError:
            if current_schedule is None:
                intro_parts.append(text)
            else:
                current_description_parts.append(text)
            continue

        if current_schedule is not None:
            finalize_event(current_schedule, current_description_parts)

        current_schedule = schedule
        current_description_parts = intro_parts[:]

    if current_schedule is None:
        return []

    finalize_event(current_schedule, current_description_parts)
    return events


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
            heading_events = extract_programata_events_from_heading_schedule(
                container,
                metadata,
                detail_url,
                category_lookup,
                region_lookup,
            )
            if heading_events:
                return [event for event in heading_events if not is_event_in_past(event)]

            line_events = extract_programata_events_from_line_schedule(
                container,
                metadata,
                detail_url,
                category_lookup,
                region_lookup,
            )
            if line_events:
                return [event for event in line_events if not is_event_in_past(event)]

            fallback_events = extract_programata_events_from_page_text(
                metadata,
                detail_url,
                category_lookup,
                region_lookup,
            )
            if fallback_events:
                return [event for event in fallback_events if not is_event_in_past(event)]

            return []

        fallback_region_text = " ".join(
            part
            for part in [metadata.get("page_text", ""), metadata.get("breadcrumb_text", ""), page_title, card_title, metadata.get("description", "")]
            if part
        )
        fallback_event = {
            "name_event": strip_trailing_year(page_title),
            "name_artist": metadata.get("author") or card_author or "Програмата",
            "place_event": "",
            "id_event_category": metadata["id_event_category"],
            "id_user": metadata["id_user"],
            "id_region": resolve_programata_region_id(region_lookup, fallback_region_text),
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
        return [apply_programata_source_identity(fallback_event, detail_url)]

    events: list[dict[str, Any]] = []
    seen_keys: set[tuple[Any, ...]] = set()

    for block in blocks:
        block_events = build_programata_event_dict(block, metadata, detail_url, category_lookup, region_lookup)
        if not block_events:
            continue
        for event_dict in block_events:
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

    line_events = extract_programata_events_from_line_schedule(
        container,
        metadata,
        detail_url,
        category_lookup,
        region_lookup,
    )
    if line_events:
        return [event for event in line_events if not is_event_in_past(event)]

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


def normalize_event_text(value: Any) -> str:
    return clean_text(str(value)) if value is not None else ""


def normalize_programata_identity_text(value: Any) -> str:
    normalized_value = normalize_event_text(value).casefold()
    normalized_value = normalized_value.replace("–", "-")
    normalized_value = re.sub(r"[.,;:/()\"'“”„]+", " ", normalized_value)
    normalized_value = re.sub(r"\s+", " ", normalized_value)
    return normalized_value.strip()


def parse_event_date(value: Any) -> date | None:
    cleaned_value = normalize_event_text(value)
    if not cleaned_value:
        return None

    try:
        return date.fromisoformat(cleaned_value)
    except ValueError:
        return None


def is_placeholder_time(value: Any) -> bool:
    return normalize_event_text(value) in {"", "00:00", "00:00:00"}


def programata_events_share_identity(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return all(
        normalize_programata_identity_text(event_value(left, key)) == normalize_programata_identity_text(event_value(right, key))
        for key in ("name_event", "name_artist", "id_event_category", "id_user")
    )


def programata_events_region_compatible(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_region = normalize_event_text(event_value(left, "id_region"))
    right_region = normalize_event_text(event_value(right, "id_region"))

    if not left_region or not right_region:
        return True

    if left_region == right_region:
        return True

    return left_region == "0" or right_region == "0"


def programata_events_place_compatible(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_place = normalize_programata_identity_text(event_value(left, "place_event"))
    right_place = normalize_programata_identity_text(event_value(right, "place_event"))

    if not left_place or not right_place:
        return True

    return (
        left_place == right_place
        or left_place in right_place
        or right_place in left_place
    )


def programata_events_overlap(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_start = parse_event_date(event_value(left, "start_date"))
    left_end = parse_event_date(event_value(left, "end_date"))
    right_start = parse_event_date(event_value(right, "start_date"))
    right_end = parse_event_date(event_value(right, "end_date"))

    if left_start is None or left_end is None or right_start is None or right_end is None:
        return False

    return left_start <= right_end and right_start <= left_end


def programata_events_time_compatible(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_start_hour = normalize_event_text(event_value(left, "start_hour"))
    left_end_hour = normalize_event_text(event_value(left, "end_hour"))
    right_start_hour = normalize_event_text(event_value(right, "start_hour"))
    right_end_hour = normalize_event_text(event_value(right, "end_hour"))

    if left_start_hour == right_start_hour and left_end_hour == right_end_hour:
        return True

    return (
        is_placeholder_time(left_start_hour)
        or is_placeholder_time(left_end_hour)
        or is_placeholder_time(right_start_hour)
        or is_placeholder_time(right_end_hour)
    )


def programata_events_can_merge(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return (
        programata_events_share_identity(left, right)
        and programata_events_region_compatible(left, right)
        and programata_events_place_compatible(left, right)
        and programata_events_overlap(left, right)
        and programata_events_time_compatible(left, right)
    )


def merge_programata_event_payload(base_payload: dict[str, Any], matching_events: list[dict[str, Any]]) -> dict[str, Any]:
    merged_payload = dict(base_payload)

    start_dates = [parse_event_date(merged_payload.get("start_date"))]
    start_dates.extend(parse_event_date(event.get("start_date")) for event in matching_events)
    valid_start_dates = [value for value in start_dates if value is not None]
    if valid_start_dates:
        merged_payload["start_date"] = min(valid_start_dates).isoformat()

    end_dates = [parse_event_date(merged_payload.get("end_date"))]
    end_dates.extend(parse_event_date(event.get("end_date")) for event in matching_events)
    valid_end_dates = [value for value in end_dates if value is not None]
    if valid_end_dates:
        merged_payload["end_date"] = max(valid_end_dates).isoformat()

    start_hours = [normalize_event_text(merged_payload.get("start_hour"))]
    start_hours.extend(normalize_event_text(event.get("start_hour")) for event in matching_events)
    merged_start_hour = next((value for value in start_hours if not is_placeholder_time(value)), start_hours[0])
    merged_payload["start_hour"] = merged_start_hour

    end_hours = [normalize_event_text(merged_payload.get("end_hour"))]
    end_hours.extend(normalize_event_text(event.get("end_hour")) for event in matching_events)
    merged_end_hour = next((value for value in end_hours if not is_placeholder_time(value)), end_hours[0])
    merged_payload["end_hour"] = merged_end_hour

    descriptions = [normalize_event_text(merged_payload.get("description"))]
    descriptions.extend(normalize_event_text(event.get("description")) for event in matching_events)
    merged_description = max((text for text in descriptions if text), key=len, default="")
    if merged_description:
        merged_payload["description"] = merged_description

    pictures = [normalize_event_text(merged_payload.get("picture"))]
    pictures.extend(normalize_event_text(event.get("picture")) for event in matching_events)
    merged_picture = next((text for text in pictures if text), "")
    merged_payload["picture"] = merged_picture or None

    return merged_payload


def build_event_payload(event: dict[str, Any]) -> dict[str, Any]:
    return {key: event_value(event, key) for key in EVENT_PAYLOAD_KEYS}


def strip_source_identity_fields(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in SOURCE_IDENTITY_FIELDS}


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


def find_existing_event_matches(
    client: Client,
    event: dict[str, Any],
    existing_events: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    source_name = normalize_event_text(event_value(event, "source_name"))
    source_event_key = normalize_event_text(event_value(event, "source_event_key"))

    if source_name and source_event_key:
        if existing_events is not None:
            source_matches = [
                row
                for row in existing_events
                if normalize_event_text(row.get("source_name")) == source_name
                and normalize_event_text(row.get("source_event_key")) == source_event_key
            ]
            if source_matches:
                return source_matches
        else:
            response = (
                client.table("events")
                .select("id_event, source_name, source_event_key, source_url, name_event, name_artist, place_event, id_event_category, id_user, id_region, start_date, start_hour, end_date, end_hour, description, picture")
                .eq("source_name", source_name)
                .eq("source_event_key", source_event_key)
                .execute()
            )
            source_matches = response.data or []
            if source_matches:
                return source_matches

    if existing_events is not None:
        return [row for row in existing_events if programata_events_can_merge(row, event)]

    start_date = event_value(event, "start_date")
    end_date = event_value(event, "end_date")

    if not start_date or not end_date:
        return []

    query = (
        client.table("events")
        .select("id_event, name_event, name_artist, place_event, id_event_category, id_user, id_region, start_date, start_hour, end_date, end_hour, description, picture")
        .eq("name_event", event_value(event, "name_event"))
        .eq("name_artist", event_value(event, "name_artist"))
        .eq("id_event_category", event_value(event, "id_event_category"))
        .eq("id_user", event_value(event, "id_user"))
        .eq("id_region", event_value(event, "id_region"))
        .lte("start_date", end_date)
        .gte("end_date", start_date)
    )
    response = query.execute()
    rows = response.data or []
    return [row for row in rows if programata_events_can_merge(row, event)]


def choose_canonical_event_match(matches: list[dict[str, Any]]) -> dict[str, Any]:
    return min(
        matches,
        key=lambda row: (
            parse_event_date(row.get("start_date")) or date.max,
            parse_event_date(row.get("end_date")) or date.max,
            int(row.get("id_event") or 0),
        ),
    )


def sync_existing_event_cache(
    existing_events: list[dict[str, Any]] | None,
    removed_event_ids: list[int],
    stored_event: dict[str, Any],
) -> None:
    if existing_events is None:
        return

    removed_id_set = {int(value) for value in removed_event_ids}
    existing_events[:] = [row for row in existing_events if int(row.get("id_event") or 0) not in removed_id_set]

    stored_event_id = int(stored_event.get("id_event") or 0)
    if stored_event_id:
        existing_events[:] = [row for row in existing_events if int(row.get("id_event") or 0) != stored_event_id]

    existing_events.append(stored_event)


def is_duplicate_key_violation(exc: Exception) -> bool:
    message = str(exc).casefold()
    return "duplicate key value violates unique constraint" in message or "unique constraint" in message and "duplicate" in message


def is_missing_source_identity_column_error(exc: Exception) -> bool:
    message = str(exc).casefold()
    return any(
        field in message
        and (
            "does not exist" in message
            or "could not find the" in message
            or "pgrst204" in message
        )
        for field in SOURCE_IDENTITY_FIELDS
    )


def upsert_event(
    client: Client,
    event: dict[str, Any],
    existing_events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = build_event_payload(event)
    fallback_payload = strip_source_identity_fields(payload)
    if not source_identity_columns_supported():
        payload = fallback_payload
    matching_events = find_existing_event_matches(client, event, existing_events)

    try:
        if not matching_events:
            try:
                response = client.table("events").insert(payload).execute()
                logger.info("Inserted event: %s", event_value(event, "name_event"))
                if existing_events is not None and response.data:
                    sync_existing_event_cache(existing_events, [], response.data[0])
            except Exception as insert_exc:
                if is_missing_source_identity_column_error(insert_exc):
                    response = client.table("events").insert(fallback_payload).execute()
                    logger.info("Inserted event without source identity columns: %s", event_value(event, "name_event"))
                    if existing_events is not None and response.data:
                        sync_existing_event_cache(existing_events, [], response.data[0])
                    return response.data[0] if response.data else fallback_payload

                if not is_duplicate_key_violation(insert_exc):
                    raise

                matching_events = find_existing_event_matches(client, event, existing_events)
                if not matching_events:
                    raise

                canonical_event = choose_canonical_event_match(matching_events)
                merged_payload = merge_programata_event_payload(payload, matching_events)
                if not source_identity_columns_supported():
                    merged_payload = strip_source_identity_fields(merged_payload)
                canonical_event_id = int(canonical_event["id_event"])
                try:
                    response = client.table("events").update(merged_payload).eq("id_event", canonical_event_id).execute()
                except Exception as update_exc:
                    if not is_missing_source_identity_column_error(update_exc):
                        raise
                    response = (
                        client.table("events")
                        .update(strip_source_identity_fields(merged_payload))
                        .eq("id_event", canonical_event_id)
                        .execute()
                    )

                duplicate_event_ids = [int(row["id_event"]) for row in matching_events if int(row["id_event"]) != canonical_event_id]
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

                if existing_events is not None and response.data:
                    sync_existing_event_cache(existing_events, duplicate_event_ids, response.data[0])

                logger.info("Recovered duplicate insert as update for event %s: %s", canonical_event_id, event_value(event, "name_event"))
        else:
            canonical_event = choose_canonical_event_match(matching_events)
            merged_payload = merge_programata_event_payload(payload, matching_events)
            canonical_event_id = int(canonical_event["id_event"])
            response = client.table("events").update(merged_payload).eq("id_event", canonical_event_id).execute()

            duplicate_event_ids = [int(row["id_event"]) for row in matching_events if int(row["id_event"]) != canonical_event_id]
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

            if existing_events is not None and response.data:
                sync_existing_event_cache(existing_events, duplicate_event_ids, response.data[0])

            logger.info("Updated event %s: %s", canonical_event_id, event_value(event, "name_event"))
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
        "--max-events",
        type=int,
        default=int(os.environ["SCRAPER_MAX_EVENTS"]) if os.environ.get("SCRAPER_MAX_EVENTS") else None,
        help="Maximum number of events to process from the parsed result set.",
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
        existing_events = load_existing_programata_events(client)

        html = fetch_html(args.url)
        events = parse_events(html, region_lookup, category_lookup, default_user_id, args.url)

        if args.max_events is not None:
            events = events[:args.max_events]

        if not events:
            logger.warning("No events found on the page.")
            return 0

        processed = 0
        for event in events:
            upsert_event(client, event, existing_events)
            processed += 1

        logger.info("Processed %s events.", processed)
        return 0
    except Exception as exc:
        logger.error("Scraper failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())