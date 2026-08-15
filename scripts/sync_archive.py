"""Build RADIO ARCHIVE data from the public Google Drive tree and Season 4 Sheet."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import os
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "archive-data.js"
REPORT = ROOT / "data" / "sync-report.json"
ROOT_FOLDER_ID = "15Z9Uvm2FHJ_KSPa0bR8PztlXxlkueBJu"
SHEET_ID = "13xdu9lNVG9cUriFfBfhQewghUZfwwCLY0tIFuEhSOTU"
FOLDER_MIME = "application/vnd.google-apps.folder"
KEY = os.environ.get("GOOGLE_DRIVE_API_KEY", "").strip()

CURRENT_MEMBERS = ["SANGYEON", "JACOB", "YOUNGHOON", "HYUNJAE", "JUYEON", "KEVIN", "Q", "SUNWOO", "ERIC"]
SPECIAL_MEMBERS = ["NEW", "HAKNYEON", "CHANHEE"]
MEMBER_PATTERNS = [
    ("SANGYEON", re.compile(r"SANGYEON|상연", re.I)),
    ("JACOB", re.compile(r"JACOB|제이콥", re.I)),
    ("YOUNGHOON", re.compile(r"YOUNGHOON|영훈", re.I)),
    ("HYUNJAE", re.compile(r"HYUNJAE|현재", re.I)),
    ("JUYEON", re.compile(r"JUYEON|주연", re.I)),
    ("KEVIN", re.compile(r"KEVIN|케빈", re.I)),
    ("Q", re.compile(r"(?:^|[^A-Z])Q(?:[^A-Z]|$)|큐", re.I)),
    ("SUNWOO", re.compile(r"SUNWOO|선우", re.I)),
    ("ERIC", re.compile(r"ERIC|에릭", re.I)),
    ("NEW", re.compile(r"(?:^|[^A-Z])NEW(?:[^A-Z]|$)|뉴", re.I)),
    ("HAKNYEON", re.compile(r"HAKNYEON|학년", re.I)),
    ("CHANHEE", re.compile(r"CHANHEE|찬희", re.I)),
]


def api_json(base: str, params: dict) -> dict:
    params = {**params, "key": KEY}
    request = Request(f"{base}?{urlencode(params)}", headers={"User-Agent": "RADIO-ARCHIVE-GitHub-Pages"})
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def list_children(folder_id: str) -> list[dict]:
    files: list[dict] = []
    page_token = ""
    while True:
        result = api_json(
            "https://www.googleapis.com/drive/v3/files",
            {
                "q": f"'{folder_id}' in parents and trashed = false",
                "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
                "pageSize": 1000,
                "orderBy": "name",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
                **({"pageToken": page_token} if page_token else {}),
            },
        )
        files.extend(result.get("files", []))
        page_token = result.get("nextPageToken", "")
        if not page_token:
            return files


def is_folder(item: dict) -> bool:
    return item.get("mimeType") == FOLDER_MIME


def folder_url(item_or_id: dict | str) -> str:
    file_id = item_or_id if isinstance(item_or_id, str) else item_or_id["id"]
    return f"https://drive.google.com/drive/folders/{file_id}"


def file_url(item: dict) -> str:
    return item.get("webViewLink") or f"https://drive.google.com/file/d/{item['id']}/view"


def media_item(item: dict) -> dict:
    return {
        "id": item["id"],
        "name": item.get("name", "Untitled"),
        "mimeType": item.get("mimeType", ""),
        "size": int(item["size"]) if item.get("size") else None,
        "viewUrl": file_url(item),
    }


def find_child(items: list[dict], *needles: str) -> dict | None:
    for item in items:
        name = item.get("name", "").lower()
        if is_folder(item) and all(needle.lower() in name for needle in needles):
            return item
    return None


def date_of(text: str) -> str:
    match = re.search(r"(?:^|\D)([12]\d{5})(?:\D|$)", str(text))
    return match.group(1) if match else ""


def episode_of(text: str) -> int | None:
    match = re.search(r"\b(?:EP|E)[.#\s_-]*0*(\d+)\b", str(text), re.I)
    return int(match.group(1)) if match else None


def order_of(text: str) -> int | None:
    match = re.match(r"\s*(\d+)\s*[.)_-]", str(text))
    return int(match.group(1)) if match else None


def strip_extension(text: str) -> str:
    return re.sub(r"\.(mp4|mp3|m4a|wav|jpg|jpeg|png|webp|srt)$", "", str(text), flags=re.I).strip()


def clean_lead(text: str) -> str:
    return re.sub(r"^\s*\d+\s*[.)_-]\s*", "", strip_extension(text)).strip()


def year_of(date: str) -> int | None:
    return int(f"20{date[:2]}") if re.fullmatch(r"\d{6}", date or "") else None


def detect_members(text: str) -> list[str]:
    return [member for member, pattern in MEMBER_PATTERNS if pattern.search(str(text))]


def first_av(items: list[dict]) -> dict | None:
    return next((item for item in items if item.get("mimeType", "").startswith(("video/", "audio/"))), None)


def sheet_rows() -> list[dict]:
    result = api_json(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}",
        {
            "includeGridData": "true",
            "ranges": "Sheet1!A1:G1000",
            "fields": "sheets(data(rowData(values(formattedValue,hyperlink,effectiveValue))))",
        },
    )
    row_data = result.get("sheets", [{}])[0].get("data", [{}])[0].get("rowData", [])

    def value(cell: dict) -> str:
        if "formattedValue" in cell:
            return str(cell["formattedValue"])
        effective = cell.get("effectiveValue", {})
        return str(next(iter(effective.values()), ""))

    rows = []
    for row in row_data[1:]:
        cells = row.get("values", []) + [{}] * 7
        number = value(cells[0]).strip()
        date = value(cells[1]).strip()
        if not number or not date:
            continue
        rows.append(
            {
                "episode": int(float(number)),
                "date": date.zfill(6),
                "title": value(cells[2]).strip(),
                "dj": value(cells[3]).strip(),
                "guest": value(cells[4]).strip(),
                "watchUrl": cells[5].get("hyperlink", ""),
                "folderUrl": cells[6].get("hyperlink", ""),
            }
        )
    return rows


def parallel_contents(folders: list[dict]) -> dict[str, list[dict]]:
    with ThreadPoolExecutor(max_workers=12) as executor:
        contents = list(executor.map(lambda item: list_children(item["id"]), folders))
    return {folder["id"]: items for folder, items in zip(folders, contents)}


def direct_series(root_items: list[dict], root_folder: dict, series_id: str, title: str, description: str, years: list[int]) -> dict:
    items = list_children(root_folder["id"])
    subs_folder = next((item for item in items if is_folder(item) and item.get("name") == "SUBS"), None)
    subtitle_episodes = {episode_of(item.get("name", "")) for item in list_children(subs_folder["id"])} if subs_folder else set()
    entries = []
    for item in items:
        if is_folder(item):
            continue
        episode = episode_of(item.get("name", ""))
        entries.append(
            {
                "id": f"{series_id}-{episode if episode is not None else item['id']}",
                "episode": episode,
                "date": "",
                "year": None,
                "title": clean_lead(item.get("name", "")),
                "djs": [], "guests": [], "members": [],
                "watchUrl": file_url(item), "folderUrl": "", "media": [],
                "hasSubtitles": episode in subtitle_episodes,
                "sortKey": episode or 0,
            }
        )
    return {"id": series_id, "title": title, "category": "radio-series", "description": description, "years": years, "entries": entries}


def nested_series(folder: dict, series_id: str, title: str, description: str) -> dict:
    items = list_children(folder["id"])
    subs_folder = next((item for item in items if is_folder(item) and item.get("name") == "SUBS"), None)
    subtitle_episodes = {episode_of(item.get("name", "")) for item in list_children(subs_folder["id"])} if subs_folder else set()
    entries = []
    for item in items:
        if is_folder(item):
            continue
        episode = episode_of(item.get("name", ""))
        entries.append(
            {
                "id": f"{series_id}-{episode if episode is not None else item['id']}",
                "episode": episode, "date": "", "year": 2022,
                "title": clean_lead(item.get("name", "")), "djs": [], "guests": [], "members": [],
                "watchUrl": file_url(item), "folderUrl": "", "media": [],
                "hasSubtitles": episode in subtitle_episodes, "sortKey": episode or 0,
            }
        )
    return {"id": series_id, "title": title, "category": "radio-series", "description": description, "years": [2022], "entries": entries}


def build_archive() -> dict:
    root_items = list_children(ROOT_FOLDER_ID)
    root_folders = [item for item in root_items if is_folder(item)]
    hello = find_child(root_folders, "hello the b")
    ddd = find_child(root_folders, "star the bs")
    idol = find_child(root_folders, "idol radio")
    mbc = find_child(root_folders, "mbc fm4u")
    year_2022 = next((item for item in root_folders if item.get("name") == "2022"), None)

    if not all((hello, ddd, idol, mbc, year_2022)):
        raise RuntimeError("A required top-level archive folder is missing or was renamed.")

    year_2022_items = list_children(year_2022["id"])
    self_character = find_child(year_2022_items, "self-character")
    catch_up = find_child(year_2022_items, "catch up")
    idol_items = list_children(idol["id"])
    season4 = find_child(idol_items, "idol radio s4")
    early = next((item for item in idol_items if is_folder(item) and item["id"] != season4["id"]), None)
    season4_items = list_children(season4["id"])
    photo_root = next((item for item in season4_items if is_folder(item)), None)
    photo_groups = [item for item in list_children(photo_root["id"]) if is_folder(item)]
    photo_folders = [folder for group in photo_groups for folder in list_children(group["id"]) if is_folder(folder)]

    early_folders = [item for item in list_children(early["id"]) if is_folder(item)]
    year_folders = [item for item in root_folders if re.fullmatch(r"20\d{2}", item.get("name", ""))]
    year_items = {folder["id"]: list_children(folder["id"]) for folder in year_folders}
    ebs = next((item for folder in year_folders for item in year_items[folder["id"]] if is_folder(item) and "EBS" in item.get("name", "")), None)
    ebs_folders = [item for item in list_children(ebs["id"]) if is_folder(item)] if ebs else []
    mbc_folders = [item for item in list_children(mbc["id"]) if is_folder(item)]

    all_episode_folders = photo_folders + early_folders + ebs_folders + mbc_folders
    contents = parallel_contents(all_episode_folders)
    photo_by_date = {date_of(folder.get("name", "")): folder for folder in photo_folders}

    season4_entries = []
    for row in sheet_rows():
        folder = photo_by_date.get(row["date"])
        files = contents.get(folder["id"], []) if folder else []
        guests = [] if row["guest"] == "------" else [part.strip() for part in row["guest"].split(",") if part.strip()]
        djs = [part.strip() for part in row["dj"].split(",") if part.strip()]
        season4_entries.append(
            {
                "id": f"idol-radio-s4-{row['episode']}", "episode": row["episode"], "date": row["date"], "year": year_of(row["date"]),
                "title": row["title"], "djs": djs, "guests": guests,
                "members": list(dict.fromkeys(detect_members(f"{row['dj']},{row['guest']}"))),
                "watchUrl": row["watchUrl"], "folderUrl": row["folderUrl"] or (folder_url(folder) if folder else ""),
                "media": [media_item(item) for item in files], "sortKey": int(row["date"]) * 1000 + row["episode"],
            }
        )

    sheet_dates = {entry["date"] for entry in season4_entries}
    unmatched = [
        {"kind": "photo-folder-without-sheet-row", "date": date_of(folder["name"]), "title": folder["name"], "folderUrl": folder_url(folder), "mediaCount": len(contents.get(folder["id"], []))}
        for folder in photo_folders if date_of(folder["name"]) not in sheet_dates
    ]

    early_entries = []
    for folder in early_folders:
        files = contents.get(folder["id"], [])
        av = first_av(files)
        date, episode = date_of(folder["name"]), episode_of(folder["name"])
        early_entries.append(
            {"id": f"idol-radio-early-{order_of(folder['name']) or folder['id']}", "episode": episode, "date": date, "year": year_of(date),
             "title": clean_lead(folder["name"]), "djs": [], "guests": [], "members": detect_members(folder["name"]),
             "watchUrl": file_url(av) if av else folder_url(folder), "folderUrl": folder_url(folder),
             "media": [media_item(item) for item in files], "sortKey": int(date or 0) * 1000 + (episode or 0)}
        )

    ebs_entries = []
    for folder in ebs_folders:
        files = contents.get(folder["id"], [])
        av = first_av(files)
        date, episode = date_of(folder["name"]), order_of(folder["name"])
        ebs_entries.append(
            {"id": f"ebs-{episode or folder['id']}", "episode": episode, "date": date, "year": year_of(date), "title": clean_lead(folder["name"]),
             "djs": ["KEVIN", "JACOB"], "guests": [], "members": ["KEVIN", "JACOB"],
             "watchUrl": file_url(av) if av else folder_url(folder), "folderUrl": folder_url(folder),
             "media": [media_item(item) for item in files], "sortKey": int(date or 0) * 1000 + (episode or 0)}
        )

    mbc_entries = []
    for folder in mbc_folders:
        files = contents.get(folder["id"], [])
        av = first_av(files)
        date, episode = date_of(folder["name"]), order_of(folder["name"])
        mbc_entries.append(
            {"id": f"mbc-{episode or folder['id']}", "episode": episode, "date": date, "year": year_of(date), "title": clean_lead(folder["name"]),
             "djs": ["YOUNGHOON"], "guests": [], "members": ["YOUNGHOON"],
             "watchUrl": file_url(av) if av else folder_url(folder), "folderUrl": folder_url(folder),
             "media": [media_item(item) for item in files], "sortKey": int(date or 0) * 1000 + (episode or 0)}
        )

    guest_entries = []
    for year_folder in year_folders:
        for item in year_items[year_folder["id"]]:
            if is_folder(item):
                continue
            date = date_of(item.get("name", ""))
            members = detect_members(item.get("name", ""))
            guest_entries.append(
                {"id": f"guest-{item['id']}", "episode": None, "date": date, "year": year_of(date) or int(year_folder["name"]),
                 "title": strip_extension(item.get("name", "")), "djs": [], "guests": [], "members": members,
                 "allMembers": bool(re.search(r"THE BOYZ", item.get("name", ""), re.I) and not members),
                 "watchUrl": file_url(item), "folderUrl": "", "media": [], "sortKey": int(date or 0)}
            )

    series = [
        {"id": "idol-radio-s4", "title": "IDOL RADIO — SEASON 4", "category": "idol-radio", "description": "Sheet-powered archive with date-linked photo galleries.", "years": [2024, 2025, 2026], "entries": season4_entries},
        {"id": "idol-radio-early", "title": "IDOL RADIO — EARLIER APPEARANCES", "category": "idol-radio", "description": "Archived appearances from 2018–2021.", "years": [2018, 2019, 2020, 2021], "entries": early_entries},
        direct_series(root_items, hello, "hello-the-b", "HELLO THE B", "80 numbered episodes with subtitle availability.", [2021, 2022]),
        direct_series(root_items, ddd, "star-the-bs-ddd", "STAR THE Bs D.D.D", "47 numbered episodes and one Halloween special.", [2021, 2022]),
        nested_series(self_character, "self-character-analysis", "THE BOYZ SELF-CHARACTER ANALYSIS", "24 numbered episodes."),
        nested_series(catch_up, "catch-up", "THE BOYZ CATCH UP", "24 numbered episodes."),
        {"id": "ebs-listening", "title": "EBS LISTENING", "category": "dj-programs", "description": "Kevin and Jacob's broadcasts with audio, video and photos.", "years": sorted({entry["year"] for entry in ebs_entries if entry["year"]}), "entries": ebs_entries},
        {"id": "mbc-close-friend", "title": "MBC CLOSE FRIEND BROADCASTING CLUB", "category": "dj-programs", "description": "Broadcasts with Younghoon.", "years": sorted({entry["year"] for entry in mbc_entries if entry["year"]}), "entries": mbc_entries},
        {"id": "guest-appearances", "title": "GUEST APPEARANCES", "category": "guest-appearances", "description": "Standalone radio and video appearances grouped by year.", "years": sorted({entry["year"] for entry in guest_entries if entry["year"]}), "entries": guest_entries},
    ]
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(), "sourceFolderId": ROOT_FOLDER_ID, "spreadsheetId": SHEET_ID,
        "currentMembers": CURRENT_MEMBERS, "specialMembers": SPECIAL_MEMBERS,
        "categories": [
            {"id": "idol-radio", "title": "IDOL RADIO", "description": "Season 4 and earlier appearances", "featured": True},
            {"id": "radio-series", "title": "RADIO SERIES", "description": "Hello THE B, STAR THE Bs D.D.D, Catch Up and Self-Character Analysis"},
            {"id": "dj-programs", "title": "DJ PROGRAMS", "description": "EBS Listening and MBC Close Friend Broadcasting Club"},
            {"id": "guest-appearances", "title": "GUEST APPEARANCES", "description": "Standalone broadcasts grouped by year"},
        ],
        "series": series, "unmatched": unmatched,
    }


def main() -> None:
    if not KEY:
        raise SystemExit("GOOGLE_DRIVE_API_KEY is required for synchronization.")
    archive = build_archive()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("window.RADIO_ARCHIVE_DATA = " + json.dumps(archive, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    summary = {
        "generatedAt": archive["generatedAt"],
        "entries": sum(len(series["entries"]) for series in archive["series"]),
        "mediaFiles": sum(len(entry.get("media", [])) for series in archive["series"] for entry in series["entries"]),
        "unmatched": archive["unmatched"],
    }
    REPORT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Synchronization failed: {exc}", file=sys.stderr)
        raise
