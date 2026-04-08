"""Allevents.in scraper scaffold for Culturo BG.

This entrypoint follows the same event contract as the Programata scraper:
each parsed event must be normalized, stamped with source identity, and passed
through the shared Supabase upsert flow.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from datetime import date, datetime, timedelta
from urllib.parse import quote, unquote, urljoin, urlparse, urlsplit, urlunsplit
from typing import Any

import requests
from bs4 import BeautifulSoup, Tag

from shared_source import dedupe_prepared_events, stamp_source_identity
from scrape_events_programata import (
    build_region_alias_lookup,
    create_supabase_client,
    is_event_in_past,
    load_lookup_maps,
    load_existing_programata_events,
    resolve_lookup_id,
    resolve_region_id_from_text,
    resolve_default_user_id,
    normalize_region_key,
    upsert_event,
    verify_supabase_connection,
)


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


ALLEVENTS_SOURCE_NAME = "allevents"
ALLEVENTS_DEFAULT_SOURCE_URL = "https://allevents.in/"
ALLEVENTS_DEFAULT_AUTHOR = "AllEvents"
ALLEVENTS_DEFAULT_CATEGORY_NAME = "Фестивали"

ALLEVENTS_CARD_SELECTOR = "li.event-card"
ALLEVENTS_RECENT_ITEM_SELECTOR = "li.item.event-item"
ALLEVENTS_TITLE_SELECTOR = "div.title a[href]"
ALLEVENTS_LOCATION_SELECTOR = "div.location"
ALLEVENTS_DATE_SELECTOR = "div.meta-top"
ALLEVENTS_IMAGE_SELECTOR = "div.banner-cont img[src]"
ALLEVENTS_CITY_PAGE_EXCLUSIONS = {"Непосочен регион", "Софийска област"}
ALLEVENTS_REGION_NAME_TO_CITY_SLUG_EXCEPTIONS = {
    "софия – град": "sofia",
    "софия - град": "sofia",
    "софия-град": "sofia",
    "софия град": "sofia",
    "русе": "ruse-ru",
}
ALLEVENTS_BG_CYRILLIC_TO_LATIN = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sht",
    "ъ": "a",
    "ь": "y",
    "ю": "yu",
    "я": "ya",
}

ALLEVENTS_CITY_SLUG_TO_REGION_NAME = {
    "blagoevgrad": "Благоевград",
    "burgas": "Бургас",
    "dobrich": "Добрич",
    "gabrovo": "Габрово",
    "haskovo": "Хасково",
    "kardzhali": "Кърджали",
    "kyustendil": "Кюстендил",
    "lovech": "Ловеч",
    "montana": "Монтана",
    "pazardzhik": "Пазарджик",
    "pernik": "Перник",
    "pleven": "Плевен",
    "plovdiv": "Пловдив",
    "razgrad": "Разград",
    "ruse-ru": "Русе",
    "silistra": "Силистра",
    "sliven": "Сливен",
    "smolyan": "Смолян",
    "sofia": "София",
    "stara-zagora": "Стара Загора",
    "targovishte": "Търговище",
    "shumen": "Шумен",
    "varna": "Варна",
    "veliko-tarnovo": "Велико Търново",
    "vidin": "Видин",
    "vratsa": "Враца",
    "yambol": "Ямбол",
}

ALLEVENTS_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

ALLEVENTS_DATE_RE = re.compile(
    r"^(?:(?P<weekday>[A-Za-z]{3,9}),\s*)?(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3,9})(?:\s+(?P<year>\d{4}))?(?:\s*(?:•|,)?\s*(?P<time>\d{1,2}:\d{2}\s*[AP]M))?(?:\s+(?P<suffix>Onwards))?$",
    re.IGNORECASE,
)
ALLEVENTS_TODAY_RE = re.compile(
    r"^Today(?:\s+(?P<month>[A-Za-z]{3,9})\s+(?P<day>\d{1,2}))?(?:\s*(?:•|,)?\s*(?P<time>\d{1,2}:\d{2}\s*[AP]M))?(?:\s+(?P<suffix>Onwards))?$",
    re.IGNORECASE,
)
ALLEVENTS_TOMORROW_RE = re.compile(
    r"^Tomorrow(?:\s+(?P<month>[A-Za-z]{3,9})\s+(?P<day>\d{1,2}))?(?:\s*(?:•|,)?\s*(?P<time>\d{1,2}:\d{2}\s*[AP]M))?(?:\s+(?P<suffix>Onwards))?$",
    re.IGNORECASE,
)
ALLEVENTS_ONGOING_RE = re.compile(r"^Ongoing$", re.IGNORECASE)
ALLEVENTS_CITYHOME_EVENTS_RE = re.compile(r"popevent_for_all_tab\s*=\s*(\[.*?\]);", re.DOTALL)
ALLEVENTS_TITLE_SUFFIX_PATTERNS = [
    re.compile(r"\s*(?:\|+|,|[-–/]|[@*]+)\s*\d{1,2}\.\d{1,2}\.\d{2,4}$", re.IGNORECASE),
    re.compile(r"\s*(?:\|+|,|[-–/]|[@*]+)\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$", re.IGNORECASE),
]
ALLEVENTS_IGNORED_SECTION_TITLES = (
    "frequently asked questions",
    "trending searches",
    "events in nearby cities",
    "host events",
    "discover events",
    "explore events around you",
    "explore events by date",
    "best of",
    "welcome to allevents.in",
    "join the people turning moments into memories",
    "about",
    "careers",
)
ALLEVENTS_THEATRE_KEYWORDS = (
    "theatre",
    "theater",
    "performances",
    "performance",
    "opera",
    "ballet",
    "play",
    "show",
    "standup",
    "stand-up",
    "comedy",
)
ALLEVENTS_CONCERT_KEYWORDS = (
    "concert",
    "live music",
    "music events",
    "music festival",
    "music",
    "tour",
    "gig",
    "dj",
    "band",
    "live",
)
ALLEVENTS_CINEMA_KEYWORDS = ("cinema", "movie", "film", "screening", "documentary")
ALLEVENTS_SPORT_KEYWORDS = (
    "sport",
    "marathon",
    "run",
    "racing",
    "race",
    "golf",
    "tennis",
    "football",
    "basketball",
    "cycling",
    "yoga",
    "fitness",
    "hike",
    "walk",
)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def normalize_allevents_city_slug(value: str) -> str:
    cleaned_value = clean_text(unquote(value))
    if not cleaned_value:
        return ""
    return re.sub(r"\s+", "-", cleaned_value.casefold())


def transliterate_allevents_bg_text(value: str) -> str:
    result_parts: list[str] = []
    for character in clean_text(value).casefold():
        result_parts.append(ALLEVENTS_BG_CYRILLIC_TO_LATIN.get(character, character))
    normalized_value = "".join(result_parts)
    normalized_value = re.sub(r"[^a-z0-9]+", "-", normalized_value)
    return normalized_value.strip("-")


def canonicalize_url(value: str) -> str:
    cleaned_value = clean_text(value)
    if not cleaned_value:
        return ""
    parsed_value = urlsplit(cleaned_value)
    return urlunsplit((parsed_value.scheme, parsed_value.netloc, parsed_value.path, "", ""))


def extract_allevents_image_url(root: Tag | BeautifulSoup, base_url: str | None = None) -> str:
    candidate_values: list[str] = []

    banner_element = root.select_one("div.banner-cont")
    if banner_element is not None:
        for attribute_name in ("data-src", "data-lazy-src", "data-original", "src"):
            candidate_values.append(clean_text(banner_element.get(attribute_name)))

        banner_image = banner_element.select_one("img")
        if banner_image is not None:
            for attribute_name in ("src", "data-src", "data-lazy-src", "data-original"):
                candidate_values.append(clean_text(banner_image.get(attribute_name)))

            srcset_value = clean_text(banner_image.get("srcset"))
            if srcset_value:
                candidate_values.append(srcset_value.split()[0])

        style_value = clean_text(banner_element.get("style"))
        if style_value:
            style_match = re.search(r"background-image:\s*url\((['\"]?)(.*?)\1\)", style_value, flags=re.IGNORECASE)
            if style_match is not None:
                candidate_values.append(style_match.group(2))

    image_element = root.select_one(ALLEVENTS_IMAGE_SELECTOR)
    if image_element is not None:
        for attribute_name in ("src", "data-src", "data-lazy-src", "data-original"):
            candidate_values.append(clean_text(image_element.get(attribute_name)))

    for raw_value in candidate_values:
        if not raw_value:
            continue
        if raw_value.startswith("data:"):
            continue
        return urljoin(base_url or "", raw_value)

    return ""


def extract_card_href(card: Tag, base_url: str | None = None) -> str:
    link_element = card.select_one(ALLEVENTS_TITLE_SELECTOR)
    if link_element is None:
        return ""
    href = clean_text(link_element.get("href"))
    if not href:
        return ""
    return canonicalize_url(urljoin(base_url or "", href))


def extract_card_image(card: Tag, base_url: str | None = None) -> str:
    return extract_allevents_image_url(card, base_url)


def extract_section_title(card: Tag) -> str:
    parent_list = card.find_parent("ul", class_=lambda value: bool(value) and "event-card-parent" in value)
    heading = parent_list.find_previous("h2") if parent_list is not None else card.find_previous("h2")
    if heading is None:
        return ""
    return clean_text(heading.get_text(" ", strip=True))


def is_ignored_allevents_section(section_title: str) -> bool:
    lowered_title = clean_text(section_title).casefold()
    if not lowered_title:
        return False
    return any(keyword in lowered_title for keyword in ALLEVENTS_IGNORED_SECTION_TITLES)


def extract_meta_text(card: Tag, selector: str) -> str:
    element = card.select_one(selector)
    if element is None:
        return ""
    return clean_text(element.get_text(" ", strip=True))


def strip_allevents_title_suffix(title: str) -> str:
    cleaned_title = clean_text(title)
    for pattern in ALLEVENTS_TITLE_SUFFIX_PATTERNS:
        cleaned_title = pattern.sub("", cleaned_title)
    return clean_text(cleaned_title)


def parse_allevents_month(month_name: str) -> int:
    month_key = clean_text(month_name).casefold().replace(".", "")[:3]
    if month_key not in ALLEVENTS_MONTHS:
        raise ValueError(f"Unsupported month name: {month_name}")
    return ALLEVENTS_MONTHS[month_key]


def parse_allevents_time(raw_time: str | None) -> str:
    cleaned_time = clean_text(raw_time)
    if not cleaned_time:
        return "00:00:00"

    normalized_time = cleaned_time.replace(".", "").upper().replace("AM", " AM").replace("PM", " PM")
    normalized_time = clean_text(normalized_time)

    for format_string in ("%I:%M %p", "%H:%M"):
        try:
            return datetime.strptime(normalized_time, format_string).time().strftime("%H:%M:%S")
        except ValueError:
            continue

    return "00:00:00"


def parse_allevents_date_text(raw_value: str, year_hint: int | None = None) -> dict[str, str]:
    cleaned_value = clean_text(raw_value).replace("•", " ")
    cleaned_value = re.sub(r"\s*\([A-Z]{2,5}\)$", "", cleaned_value)
    if not cleaned_value:
        raise ValueError("Missing Allevents schedule value")

    today_value = date.today()

    if ALLEVENTS_ONGOING_RE.fullmatch(cleaned_value):
        today_iso = today_value.isoformat()
        return {
            "start_date": today_iso,
            "start_hour": "00:00:00",
            "end_date": today_iso,
            "end_hour": "00:00:00",
        }

    today_match = ALLEVENTS_TODAY_RE.fullmatch(cleaned_value)
    if today_match is not None:
        time_value = parse_allevents_time(today_match.group("time"))
        today_iso = today_value.isoformat()
        return {
            "start_date": today_iso,
            "start_hour": time_value,
            "end_date": today_iso,
            "end_hour": time_value,
        }

    tomorrow_match = ALLEVENTS_TOMORROW_RE.fullmatch(cleaned_value)
    if tomorrow_match is not None:
        tomorrow_value = today_value + timedelta(days=1)
        time_value = parse_allevents_time(tomorrow_match.group("time"))
        tomorrow_iso = tomorrow_value.isoformat()
        return {
            "start_date": tomorrow_iso,
            "start_hour": time_value,
            "end_date": tomorrow_iso,
            "end_hour": time_value,
        }

    date_match = ALLEVENTS_DATE_RE.fullmatch(cleaned_value)
    if date_match is None:
        raise ValueError(f"Unsupported Allevents schedule: {raw_value}")

    year_value = int(date_match.group("year") or year_hint or today_value.year)
    month_value = parse_allevents_month(date_match.group("month"))
    day_value = int(date_match.group("day"))
    candidate_date = date(year_value, month_value, day_value)
    if date_match.group("year") is None and candidate_date < today_value and (today_value - candidate_date).days > 180:
        candidate_date = date(year_value + 1, month_value, day_value)

    time_value = parse_allevents_time(date_match.group("time"))
    date_iso = candidate_date.isoformat()
    return {
        "start_date": date_iso,
        "start_hour": time_value,
        "end_date": date_iso,
        "end_hour": time_value,
    }


def parse_allevents_recent_left_date(left_text: str, year_hint: int | None = None) -> dict[str, str]:
    cleaned_value = clean_text(left_text).replace("Onwards", "")
    cleaned_value = cleaned_value.replace("–", "-")
    cleaned_value = re.sub(r"\s+", " ", cleaned_value)

    match = re.fullmatch(
        r"(?P<month>[A-Za-z]{3,9})\s*(?P<start_day>\d{1,2})(?:\s*-\s*(?P<end_day>\d{1,2}))?",
        cleaned_value,
        flags=re.IGNORECASE,
    )
    if match is None:
        raise ValueError(f"Unsupported recently-added date header: {left_text}")

    today_value = date.today()
    year_value = year_hint or today_value.year
    month_value = parse_allevents_month(match.group("month"))
    start_day = int(match.group("start_day"))
    end_day = int(match.group("end_day") or start_day)

    start_date = date(year_value, month_value, start_day)
    end_date = date(year_value, month_value, end_day)

    if start_date < today_value and not match.group("end_day") and (today_value - start_date).days > 180:
        start_date = date(year_value + 1, month_value, start_day)
        end_date = start_date

    return {
        "start_date": start_date.isoformat(),
        "start_hour": "00:00:00",
        "end_date": end_date.isoformat(),
        "end_hour": "00:00:00",
    }


def contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    lowered_text = clean_text(text).casefold()
    return any(keyword in lowered_text for keyword in keywords)


def infer_allevents_category_name(section_title: str, title: str, location_text: str, description_text: str = "") -> str:
    combined_text = " ".join(part for part in [section_title, title, location_text, description_text] if part)

    if contains_any(combined_text, ALLEVENTS_SPORT_KEYWORDS):
        return "Спорт"
    if contains_any(combined_text, ALLEVENTS_CINEMA_KEYWORDS):
        return "Кино"
    if contains_any(combined_text, ALLEVENTS_THEATRE_KEYWORDS):
        return "Театър"
    if contains_any(combined_text, ALLEVENTS_CONCERT_KEYWORDS):
        return "Концерти"
    return ALLEVENTS_DEFAULT_CATEGORY_NAME


def resolve_allevents_category_id(
    category_lookup: dict[str, int],
    section_title: str,
    title: str,
    location_text: str,
    description_text: str = "",
) -> int:
    category_name = infer_allevents_category_name(section_title, title, location_text, description_text)
    try:
        return resolve_lookup_id(category_name, category_lookup, "event category")
    except ValueError:
        fallback_key = clean_text(ALLEVENTS_DEFAULT_CATEGORY_NAME).casefold()
        if fallback_key in category_lookup:
            return category_lookup[fallback_key]
        return next(iter(category_lookup.values()))


def extract_page_city_slug(url: str | None) -> str:
    parsed_url = urlparse(clean_text(url))
    path_parts = [part for part in parsed_url.path.split("/") if part]
    if not path_parts:
        return ""
    first_part = normalize_allevents_city_slug(path_parts[0])
    if first_part in {"events", "location.php", "pages", "blog"}:
        return ""
    return first_part


def derive_allevents_city_slug(region_name: str) -> str:
    normalized_region_name = normalize_region_key(region_name)
    if not normalized_region_name or normalized_region_name in {normalize_region_key(value) for value in ALLEVENTS_CITY_PAGE_EXCLUSIONS}:
        return ""

    for candidate_name, city_slug in ALLEVENTS_REGION_NAME_TO_CITY_SLUG_EXCEPTIONS.items():
        if normalized_region_name == normalize_region_key(candidate_name):
            return city_slug

    return transliterate_allevents_bg_text(region_name)


def build_allevents_city_page_urls(region_lookup: dict[str, int]) -> list[str]:
    city_urls: list[str] = []
    seen_urls: set[str] = set()

    for region_name in region_lookup.keys():
        city_slug = derive_allevents_city_slug(region_name)
        if not city_slug:
            continue

        city_root = f"https://allevents.in/{quote(city_slug, safe='-')}"
        for candidate_url in [f"{city_root}?ref=cityselect", f"{city_root}/recently-added?ref=cityselect"]:
            normalized_url = canonicalize_url(candidate_url) or candidate_url
            if normalized_url in seen_urls:
                continue
            seen_urls.add(normalized_url)
            city_urls.append(candidate_url)

    return city_urls


def build_allevents_source_urls(start_url: str, region_lookup: dict[str, int]) -> list[str]:
    source_urls: list[str] = []
    seen_urls: set[str] = set()

    def add_url(candidate_url: str) -> None:
        normalized_url = canonicalize_url(candidate_url) or candidate_url
        if normalized_url in seen_urls:
            return
        seen_urls.add(normalized_url)
        source_urls.append(candidate_url)

    start_city_slug = extract_page_city_slug(start_url)
    if start_city_slug:
        add_url(start_url)
        if not clean_text(urlparse(start_url).path).endswith("recently-added"):
            add_url(urljoin(start_url.rstrip("/") + "/", "recently-added"))

    for city_url in build_allevents_city_page_urls(region_lookup):
        add_url(city_url)

    return source_urls


def resolve_allevents_region_id(
    region_lookup: dict[str, int],
    section_title: str,
    title: str,
    location_text: str,
    source_url: str | None,
    source_page_url: str | None,
) -> int | None:
    alias_lookup = build_region_alias_lookup(region_lookup)

    for text_value in [location_text, section_title, title]:
        region_id = resolve_region_id_from_text(text_value, alias_lookup)
        if region_id is not None:
            return region_id

    for candidate_url in [source_url, source_page_url]:
        city_slug = extract_page_city_slug(candidate_url)
        if not city_slug:
            continue
        region_name = ALLEVENTS_CITY_SLUG_TO_REGION_NAME.get(city_slug)
        if not region_name:
            continue
        try:
            return resolve_lookup_id(region_name, region_lookup, "region")
        except ValueError:
            continue

    return None


def resolve_allevents_page_region_id(region_lookup: dict[str, int], source_page_url: str | None) -> int | None:
    page_city_slug = extract_page_city_slug(source_page_url)
    if not page_city_slug:
        return None

    region_name = ALLEVENTS_CITY_SLUG_TO_REGION_NAME.get(page_city_slug)
    candidate_values = [value for value in [region_name, page_city_slug] if value]

    alias_lookup = build_region_alias_lookup(region_lookup)
    for candidate_value in candidate_values:
        matched_region_id = resolve_region_id_from_text(candidate_value, alias_lookup)
        if matched_region_id is not None:
            return matched_region_id

        try:
            return resolve_lookup_id(candidate_value, region_lookup, "region")
        except ValueError:
            continue

    return None


def build_description(section_title: str, location_text: str, title: str, description_hint: str = "") -> str:
    description_value = clean_text(" | ".join(part for part in [description_hint, section_title, location_text, title] if part))
    if description_value:
        return description_value
    return clean_text(title) or ALLEVENTS_DEFAULT_AUTHOR


def build_allevents_event(
    title_text: str,
    location_text: str,
    section_title: str,
    schedule: dict[str, str],
    category_lookup: dict[str, int],
    region_lookup: dict[str, int],
    default_user_id: int | None,
    detail_url: str,
    source_page_url: str | None,
    page_region_id: int | None = None,
    description_hint: str = "",
    picture: str | None = None,
) -> dict[str, Any] | None:
    region_id = resolve_allevents_region_id(region_lookup, section_title, title_text, location_text, detail_url, source_page_url)
    if region_id is None:
        region_id = page_region_id
    if region_id is None:
        return None

    return {
        "name_event": title_text,
        "name_artist": ALLEVENTS_DEFAULT_AUTHOR,
        "place_event": location_text,
        "id_event_category": resolve_allevents_category_id(category_lookup, section_title, title_text, location_text, description_hint),
        "id_user": default_user_id if default_user_id is not None else 1,
        "id_region": region_id,
        "start_date": schedule["start_date"],
        "start_hour": schedule["start_hour"],
        "end_date": schedule["end_date"],
        "end_hour": schedule["end_hour"],
        "picture": clean_text(picture) or None,
        "description": build_description(section_title, location_text, title_text, description_hint),
        "source_url": detail_url,
        "section_title": section_title,
    }


def extract_allevents_cityhome_events(html: str) -> list[dict[str, Any]]:
    match = ALLEVENTS_CITYHOME_EVENTS_RE.search(html)
    if match is None:
        return []

    try:
        parsed_events = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    if not isinstance(parsed_events, list):
        return []

    return [event for event in parsed_events if isinstance(event, dict)]


def parse_cityhome_js_event(
    item: dict[str, Any],
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_page_url: str | None,
    page_region_id: int | None,
) -> dict[str, Any] | None:
    detail_url = canonicalize_url(clean_text(item.get("event_url") or item.get("share_url") or ""))
    if not detail_url:
        return None

    title_text = strip_allevents_title_suffix(clean_text(item.get("eventname_raw") or item.get("eventname") or ""))
    if not title_text:
        return None

    venue_value = item.get("venue") if isinstance(item.get("venue"), dict) else {}
    venue_name = clean_text(item.get("location"))
    venue_street = clean_text(venue_value.get("street") if isinstance(venue_value, dict) else "")
    venue_full_address = clean_text(venue_value.get("full_address") if isinstance(venue_value, dict) else "")
    location_text = clean_text(" | ".join(part for part in [venue_name, venue_street or venue_full_address] if part))

    start_value = clean_text(item.get("start_time_display") or item.get("app_display_time") or item.get("display_time_label") or "")
    end_value = clean_text(item.get("end_time_display") or "")
    if not start_value:
        return None

    try:
        schedule = parse_allevents_date_text(start_value.replace(" at ", " • "), date.today().year)
    except ValueError:
        return None

    if end_value and end_value != start_value:
        try:
            end_schedule = parse_allevents_date_text(end_value.replace(" at ", " • "), date.today().year)
            schedule["end_date"] = end_schedule["end_date"]
            schedule["end_hour"] = end_schedule["end_hour"]
        except ValueError:
            pass

    description_hint = clean_text(item.get("short_description"))
    picture_value = clean_text(item.get("banner_url") or item.get("thumb_url_large") or item.get("thumb_url") or "")

    event = build_allevents_event(
        title_text,
        location_text,
        "",
        schedule,
        category_lookup,
        region_lookup,
        default_user_id,
        detail_url,
        source_page_url,
        page_region_id=page_region_id,
        description_hint=description_hint,
        picture=picture_value,
    )
    if event is None:
        return None

    source_event_key = clean_text(item.get("event_id") or detail_url)
    if source_event_key:
        event["source_event_key"] = source_event_key

    return event


def parse_homepage_event_card(
    card: Tag,
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_url: str | None = None,
    page_region_id: int | None = None,
) -> dict[str, Any] | None:
    detail_url = extract_card_href(card, source_url)
    if not detail_url:
        return None

    title_element = card.select_one(ALLEVENTS_TITLE_SELECTOR)
    if title_element is None:
        return None

    title_text = strip_allevents_title_suffix(clean_text(title_element.get_text(" ", strip=True)))
    if not title_text:
        return None

    date_text = extract_meta_text(card, ALLEVENTS_DATE_SELECTOR)
    location_text = extract_meta_text(card, ALLEVENTS_LOCATION_SELECTOR)
    section_title = extract_section_title(card)
    picture_value = extract_card_image(card, source_url)

    try:
        schedule = parse_allevents_date_text(date_text)
    except ValueError:
        logger.debug("Skipping Allevents card with unsupported schedule %s", detail_url)
        return None

    return build_allevents_event(
        title_text,
        location_text,
        section_title,
        schedule,
        category_lookup,
        region_lookup,
        default_user_id,
        detail_url,
        source_url,
        page_region_id=page_region_id,
        picture=picture_value,
    )


def parse_recently_added_item(
    item: Tag,
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_url: str | None = None,
    page_region_id: int | None = None,
) -> dict[str, Any] | None:
    title_anchor = item.select_one("div.meta-right div.title a[href]")
    if title_anchor is None:
        return None

    detail_url = canonicalize_url(urljoin(source_url or "", clean_text(title_anchor.get("href"))))
    if not detail_url:
        return None

    title_text = strip_allevents_title_suffix(clean_text(title_anchor.get_text(" ", strip=True)))
    location_text = extract_meta_text(item, "div.meta-right span.up-venue")
    left_text = extract_meta_text(item, "div.meta-left")
    right_time_text = extract_meta_text(item, "div.meta-right span.up-time-display")
    section_title = extract_section_title(item)

    try:
        schedule = parse_allevents_recent_left_date(left_text)
    except ValueError:
        return None

    try:
        timed_schedule = parse_allevents_date_text(right_time_text.replace(" at ", " • "), schedule["start_date"].split("-")[0].split("-")[0])
        schedule["start_date"] = timed_schedule["start_date"]
        schedule["start_hour"] = timed_schedule["start_hour"]
        if schedule["end_date"] == schedule["start_date"]:
            schedule["end_hour"] = timed_schedule["end_hour"]
    except ValueError:
        pass

    picture_value = clean_text(item.select_one("div.thumb").get("data-src") if item.select_one("div.thumb") else "")

    return build_allevents_event(
        title_text,
        location_text,
        section_title,
        schedule,
        category_lookup,
        region_lookup,
        default_user_id,
        detail_url,
        source_url,
        page_region_id=page_region_id,
        picture=picture_value,
    )


def parse_allevents_detail_page(
    detail_html: str,
    detail_url: str,
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_page_url: str | None,
    page_region_id: int | None,
    title_hint: str | None = None,
) -> dict[str, Any] | None:
    soup = BeautifulSoup(detail_html, "html.parser")

    title_value = clean_text(
        (soup.select_one('meta[property="og:title"]') or soup.select_one("h1")).get("content")
        if soup.select_one('meta[property="og:title"]') is not None
        else (soup.select_one("h1").get_text(" ", strip=True) if soup.select_one("h1") is not None else "")
    )
    if not title_value:
        title_value = clean_text(title_hint)
    if not title_value:
        return None

    date_section = soup.select_one("div.datetime-location-section")
    if date_section is None:
        return None

    time_value = clean_text(date_section.select_one("p.event-time-label").get_text(" ", strip=True) if date_section.select_one("p.event-time-label") is not None else "")
    if not time_value:
        return None

    venue_elements = date_section.select("p.event-location")
    venue_name = clean_text(venue_elements[0].get_text(" ", strip=True)) if venue_elements else ""
    venue_address = clean_text(venue_elements[1].get_text(" ", strip=True)) if len(venue_elements) > 1 else ""
    location_text = clean_text(" | ".join(part for part in [venue_name, venue_address] if part))

    image_value = clean_text(
        (soup.select_one('meta[property="og:image"]') or soup.select_one('meta[name="twitter:image"]')).get("content")
        if soup.select_one('meta[property="og:image"]') is not None or soup.select_one('meta[name="twitter:image"]') is not None
        else ""
    )

    try:
        schedule = parse_allevents_date_text(time_value)
    except ValueError:
        return None

    return build_allevents_event(
        title_value,
        location_text,
        "",
        schedule,
        category_lookup,
        region_lookup,
        default_user_id,
        detail_url,
        source_page_url,
        page_region_id=page_region_id,
        picture=image_value,
    )


def fetch_html(url: str, timeout_seconds: int = 30) -> str:
    response = requests.get(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CulturoBG-Scraper/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,bg;q=0.8",
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    return response.text


def parse_events(
    html: str,
    region_lookup: dict[str, int],
    category_lookup: dict[str, int],
    default_user_id: int | None,
    source_url: str | None = None,
) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    records: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    source_page_city_slug = extract_page_city_slug(source_url)
    page_region_id = resolve_allevents_page_region_id(region_lookup, source_url)
    seen_detail_urls: set[str] = set()

    for index, item in enumerate(extract_allevents_cityhome_events(html), start=1):
        try:
            event = parse_cityhome_js_event(item, region_lookup, category_lookup, default_user_id, source_url, page_region_id)
        except Exception as exc:
            logger.debug("Skipping cityhome JS item %s: %s", index, exc)
            continue

        if event is None:
            continue

        if is_event_in_past(event):
            continue

        event_key = clean_text(event.get("source_event_key") or event.get("source_url") or event.get("name_event") or "")
        if event_key in seen_keys:
            continue

        seen_keys.add(event_key)
        records.append(event)

    for index, card in enumerate(soup.select(ALLEVENTS_CARD_SELECTOR), start=1):
        if not isinstance(card, Tag):
            continue

        try:
            event = parse_homepage_event_card(card, region_lookup, category_lookup, default_user_id, source_url, page_region_id)
        except Exception as exc:
            logger.debug("Skipping Allevents card %s: %s", index, exc)
            continue

        if event is None:
            continue

        if is_event_in_past(event):
            continue

        if is_ignored_allevents_section(clean_text(event.get("section_title"))):
            continue

        if source_page_city_slug:
            event_city_slug = extract_page_city_slug(event.get("source_url"))
            if event_city_slug and event_city_slug != source_page_city_slug:
                continue

        event_key = clean_text(event.get("source_url") or event.get("name_event") or "")
        if event_key in seen_keys:
            continue

        seen_keys.add(event_key)
        records.append(event)

    for container in soup.select('div.footer-links-cont'):
        heading_element = container.select_one('h3.footer-head-title')
        heading_text = clean_text(heading_element.get_text(' ', strip=True) if heading_element is not None else '')
        if not heading_text.casefold().startswith('upcoming events in '):
            continue

        for index, item in enumerate(container.select('ul.footer-links > li'), start=1):
            if not isinstance(item, Tag):
                continue

            title_anchor = item.select_one('a[href]')
            if title_anchor is None:
                continue

            detail_url = canonicalize_url(urljoin(source_url or '', clean_text(title_anchor.get('href'))))
            if not detail_url or detail_url in seen_detail_urls:
                continue
            seen_detail_urls.add(detail_url)

            try:
                detail_html = fetch_html(detail_url)
                event = parse_allevents_detail_page(
                    detail_html,
                    detail_url,
                    region_lookup,
                    category_lookup,
                    default_user_id,
                    source_url,
                    page_region_id,
                    title_hint=clean_text(title_anchor.get_text(' ', strip=True)),
                )
            except Exception as exc:
                logger.debug('Skipping upcoming footer item %s: %s', index, exc)
                continue

            if event is None:
                continue

            if is_event_in_past(event):
                continue

            if is_ignored_allevents_section(clean_text(event.get('section_title'))):
                continue

            if source_page_city_slug:
                event_city_slug = extract_page_city_slug(event.get('source_url'))
                if event_city_slug and event_city_slug != source_page_city_slug:
                    continue

            event_key = clean_text(event.get('source_url') or event.get('name_event') or '')
            if event_key in seen_keys:
                continue

            seen_keys.add(event_key)
            records.append(event)

    for index, item in enumerate(soup.select(ALLEVENTS_RECENT_ITEM_SELECTOR), start=1):
        if not isinstance(item, Tag):
            continue

        try:
            event = parse_recently_added_item(item, region_lookup, category_lookup, default_user_id, source_url, page_region_id)
        except Exception as exc:
            logger.debug("Skipping recently-added item %s: %s", index, exc)
            continue

        if event is None:
            continue

        if is_event_in_past(event):
            continue

        if is_ignored_allevents_section(clean_text(event.get("section_title"))):
            continue

        if source_page_city_slug:
            event_city_slug = extract_page_city_slug(event.get("source_url"))
            if event_city_slug and event_city_slug != source_page_city_slug:
                continue

        event_key = clean_text(event.get("source_url") or event.get("name_event") or "")
        if event_key in seen_keys:
            continue

        seen_keys.add(event_key)
        records.append(event)

    return records


def normalize_allevents_event(event: dict[str, Any], source_key: str) -> dict[str, Any]:
    return stamp_source_identity(event, ALLEVENTS_SOURCE_NAME, source_key, event.get("source_url") or source_key)


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Allevents.in and save events to Supabase.")
    parser.add_argument(
        "--url",
        default=os.environ.get("SCRAPER_SOURCE_URL") or ALLEVENTS_DEFAULT_SOURCE_URL,
        help="Events page URL (defaults to Allevents.in homepage)",
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

        source_urls = build_allevents_source_urls(args.url, region_lookup)

        events: list[dict[str, Any]] = []
        seen_source_urls: set[str] = set()
        for source_page_url in source_urls:
            normalized_source_page_url = canonicalize_url(source_page_url) or source_page_url
            if normalized_source_page_url in seen_source_urls:
                continue
            seen_source_urls.add(normalized_source_page_url)
            html = fetch_html(source_page_url)
            events.extend(parse_events(html, region_lookup, category_lookup, default_user_id, source_page_url))

        deduped_events = dedupe_prepared_events(events)
        if len(deduped_events) != len(events):
            logger.info("Removed %s duplicate prepared events.", len(events) - len(deduped_events))
        events = deduped_events

        if not events:
            logger.warning("No events found on the page.")
            return 0

        processed = 0
        for event in events:
            normalized_event = normalize_allevents_event(event, event.get("source_event_key") or event.get("source_url") or args.url)
            upsert_event(client, normalized_event, existing_events)
            processed += 1

        logger.info("Processed %s events.", processed)
        return 0
    except Exception as exc:
        logger.error("Scraper failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())