#!/usr/bin/env python3
"""
generate_wiki.py — Convert vocabulary.md into an Obsidian-style wiki.
One .md file per vocabulary word, one subfolder per topic.
"""

import re
import os
from pathlib import Path
from collections import defaultdict, Counter

# ─── Paths ────────────────────────────────────────────────────────────────────
VOCAB_FILE = Path("/Users/kevin/Documents/Projects/spelling/vocabulary.md")
WIKI_DIR   = Path("/Users/kevin/Documents/Projects/spelling/wiki")

# ─── Topic name → folder slug mapping ────────────────────────────────────────
TOPIC_FOLDER = {
    "Business & Commerce":         "business-commerce",
    "Finance & Economics":         "finance-economics",
    "Law & Regulation":            "law-regulation",
    "Politics & Government":       "politics-government",
    "Workplace & Human Resources": "workplace-human-resources",
    "Technology & Digital":        "technology-digital",
    "Health & Medicine":           "health-medicine",
    "Environment & Sustainability":"environment-sustainability",
    "Arts, Culture & Media":       "arts-culture-media",
    "Psychology & Behaviour":      "psychology-behaviour",
    "Education & Academia":        "education-academia",
    "Social Issues & Society":     "social-issues-society",
    "Travel & Places":             "travel-places",
    "Food & Dining":               "food-dining",
    "Formal Vocabulary":           "formal-vocabulary",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_slug(word: str) -> str:
    """Convert a vocabulary word to a file slug (abbrev-aware)."""
    s = word.lower()
    # Remove parenthetical expansions — keep the abbreviation part before them.
    # e.g. "GDP (Gross Domestic Product)" → "GDP"
    s = re.sub(r"\s*\(.*?\)", "", s)
    # Remove special characters except hyphens and spaces
    s = re.sub(r"[^a-z0-9\s\-]", "", s)
    # Collapse whitespace → hyphens
    s = re.sub(r"\s+", "-", s.strip())
    # Collapse multiple hyphens
    s = re.sub(r"-{2,}", "-", s)
    s = s.strip("-")
    return s


def parse_vocabulary(path: Path):
    """
    Parse vocabulary.md and return a list of word records.

    Each record has a unique 'uid' = 'folder/slug' so that words with
    the same slug in different topics are kept separate.
    """
    text = path.read_text(encoding="utf-8")
    records = []
    errors  = []

    current_topic  = None
    current_folder = None
    current_sub    = None
    topic_counter  = 0  # position within the current topic

    topic_re = re.compile(r"^## \d+\. (.+)$")
    sub_re   = re.compile(r"^### (.+)$")
    entry_re = re.compile(
        r"^\*\*(.+?)\*\*\s+"        # word (bold)
        r"\*\((.+?)\)\*"            # pos in italic parens
        r"\s*—\s*"                  # em-dash separator
        r"(.+?)"                    # definition
        r"\s+\*\"(.+?)\"\*\s*$"    # example in italic quotes
    )

    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.rstrip()
        if not line:
            continue

        m = topic_re.match(line)
        if m:
            current_topic  = m.group(1).strip()
            current_folder = TOPIC_FOLDER.get(current_topic)
            if current_folder is None:
                errors.append(f"Line {lineno}: unknown topic '{current_topic}'")
            current_sub   = None
            topic_counter = 0
            continue

        m = sub_re.match(line)
        if m:
            current_sub = m.group(1).strip()
            continue

        m = entry_re.match(line)
        if m:
            if current_topic is None:
                errors.append(f"Line {lineno}: entry before any topic header")
                continue
            word, pos, defn, ex = m.group(1), m.group(2), m.group(3), m.group(4)
            word = word.strip()
            slug = make_slug(word)
            uid  = f"{current_folder}/{slug}"
            records.append({
                "word":         word,
                "slug":         slug,
                "uid":          uid,
                "pos":          pos.strip(),
                "definition":   defn.strip(),
                "example":      ex.strip(),
                "topic":        current_topic,
                "topic_folder": current_folder,
                "subtopic":     current_sub,
                "topic_index":  topic_counter,
            })
            topic_counter += 1
            continue

    return records, errors


# ─── Link-building ────────────────────────────────────────────────────────────

MIN_SHARED = 5   # minimum chars for morphological / cross-topic match
MAX_LINKS  = 8   # maximum See also links per word


def build_see_also(records):
    """
    Build See also links for every word.
    Returns dict: uid → list[uid]

    Link types:
      (a) Morphological: shared root ≥5 chars (substring or shared prefix)
      (b) Same-topic neighbours: ±3 positions in topic
      (c) Cross-topic same-word: different-topic records whose slugs
          contain each other (min 5 chars)
    """
    all_uids = {r["uid"] for r in records}

    # uid → record
    uid_map = {r["uid"]: r for r in records}

    # Group by topic for neighbour links
    by_topic = defaultdict(list)
    for r in records:
        by_topic[r["topic"]].append(r)

    # Pre-build morphological & cross-topic pairs
    morph_links = defaultdict(set)  # uid → set of uids

    for i, ri in enumerate(records):
        for j, rj in enumerate(records):
            if i >= j:
                continue
            ui, uj = ri["uid"], rj["uid"]
            si, sj = ri["slug"], rj["slug"]
            if len(si) < MIN_SHARED or len(sj) < MIN_SHARED:
                continue

            linked = False

            # Substring check (covers morphological family AND cross-topic same-word)
            if si in sj or sj in si:
                linked = True

            # Shared prefix ≥ MIN_SHARED (morphological)
            if not linked:
                prefix_len = sum(1 for a, b in zip(si, sj) if a == b) \
                    if False else 0
                # proper prefix check
                pl = 0
                for a, b in zip(si, sj):
                    if a == b:
                        pl += 1
                    else:
                        break
                if pl >= MIN_SHARED:
                    linked = True

            if linked:
                morph_links[ui].add(uj)
                morph_links[uj].add(ui)

    # Build final see-also per word
    see_also = {}
    for r in records:
        uid = r["uid"]
        related = set()

        # (a) Morphological / cross-topic substring
        related.update(morph_links.get(uid, set()))

        # (b) Same-topic neighbours ±3
        topic_words = by_topic[r["topic"]]
        idx = r["topic_index"]
        for offset in range(-3, 4):
            if offset == 0:
                continue
            ni = idx + offset
            if 0 <= ni < len(topic_words):
                related.add(topic_words[ni]["uid"])

        # Remove self, non-existent uids, then cap
        related.discard(uid)
        related = {u for u in related if u in all_uids}

        # Sort for determinism, cap at MAX_LINKS
        see_also[uid] = sorted(related)[:MAX_LINKS]

    return see_also


# ─── Wikilink helper ──────────────────────────────────────────────────────────

def uid_to_wikilink(uid: str, records_by_uid: dict) -> str:
    """
    Convert a uid like 'business-commerce/equity' into an Obsidian wikilink.

    If the slug is unique across the vault → [[slug]]
    If ambiguous (same slug in multiple folders) → [[folder/slug]]
    """
    # Count how many records share this uid's slug
    slug = uid.split("/", 1)[1]
    r    = records_by_uid.get(uid)
    if r is None:
        return f"[[{uid}]]"
    return f"[[{uid}]]"   # always use full path for safety/clarity


# ─── File generation ──────────────────────────────────────────────────────────

def write_word_file(record, see_also_uids, wiki_dir: Path, records_by_uid: dict) -> Path:
    """Write one word file and return its path."""
    folder = wiki_dir / record["topic_folder"]
    folder.mkdir(parents=True, exist_ok=True)

    slug     = record["slug"]
    filepath = folder / f"{slug}.md"

    topic_link = f"[[_index]] > {record['topic']}"
    if record["subtopic"]:
        topic_link += f" ({record['subtopic']})"

    see_also_str = ""
    if see_also_uids:
        links = ", ".join(uid_to_wikilink(u, records_by_uid) for u in see_also_uids)
        see_also_str = f"\n**See also:** {links}\n"

    content = (
        f"# {record['word']}\n"
        f"*({record['pos']})*\n"
        f"\n"
        f"{record['definition']}\n"
        f"\n"
        f"> \"{record['example']}\"\n"
        f"\n"
        f"**Topic:** {topic_link}\n"
        f"{see_also_str}"
    )

    filepath.write_text(content, encoding="utf-8")
    return filepath


def write_topic_index(topic_name, topic_folder, records, wiki_dir: Path):
    """Write _index.md in a topic folder."""
    folder = wiki_dir / topic_folder
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "_index.md"

    lines = [f"# {topic_name}", f"{len(records)} words", ""]

    # Group by subtopic if present
    by_sub = defaultdict(list)
    for r in records:
        by_sub[r["subtopic"] or ""].append(r)

    for sub, sub_records in sorted(by_sub.items()):
        if sub:
            lines.append(f"## {sub}")
            lines.append("")
        for r in sub_records:
            lines.append(f"- [[{r['uid']}|{r['word']}]]")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def write_master_index(all_records, wiki_dir: Path):
    """Write wiki/_index.md."""
    path = wiki_dir / "_index.md"

    seen_topics   = []
    topic_counts  = defaultdict(int)
    topic_folders = {}
    for r in all_records:
        t = r["topic"]
        if t not in topic_folders:
            seen_topics.append(t)
            topic_folders[t] = r["topic_folder"]
        topic_counts[t] += 1

    lines = [
        "# Vocabulary Wiki — Advanced English (UK)",
        f"~{len(all_records)} words | 15 topics | For Cantonese speakers",
        "",
        "## Topics",
    ]
    for t in seen_topics:
        folder = topic_folders[t]
        count  = topic_counts[t]
        lines.append(f"- [[{folder}/_index|{t}]] ({count} words)")

    lines += ["", "## All Words (A–Z)", ""]

    sorted_records = sorted(all_records, key=lambda r: r["slug"])
    for r in sorted_records:
        lines.append(f"- [[{r['uid']}|{r['word']}]]")

    path.write_text("\n".join(lines), encoding="utf-8")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Parsing vocabulary.md …")
    records, errors = parse_vocabulary(VOCAB_FILE)
    print(f"  → {len(records)} entries parsed, {len(errors)} parse errors")
    for e in errors:
        print(f"  NOTE: {e}")

    # Warn about slug collisions within same topic folder
    uid_counts = Counter(r["uid"] for r in records)
    collisions = {uid: cnt for uid, cnt in uid_counts.items() if cnt > 1}
    if collisions:
        print(f"\n  WARNING: {len(collisions)} uid collision(s) — last entry wins:")
        for uid, cnt in collisions.items():
            print(f"    {uid} ({cnt} times)")

    print("\nBuilding See also links …")
    see_also = build_see_also(records)
    total_links = sum(len(v) for v in see_also.values())
    print(f"  → {total_links} links generated")

    print(f"\nWriting files to {WIKI_DIR} …")
    WIKI_DIR.mkdir(parents=True, exist_ok=True)

    records_by_uid = {r["uid"]: r for r in records}

    files_created = 0

    # Word files
    for r in records:
        write_word_file(r, see_also.get(r["uid"], []), WIKI_DIR, records_by_uid)
        files_created += 1

    # Topic indexes
    by_topic = defaultdict(list)
    topic_folder_map = {}
    for r in records:
        by_topic[r["topic"]].append(r)
        topic_folder_map[r["topic"]] = r["topic_folder"]

    for topic, trecs in by_topic.items():
        write_topic_index(topic, topic_folder_map[topic], trecs, WIKI_DIR)
        files_created += 1

    # Master index
    write_master_index(records, WIKI_DIR)
    files_created += 1

    print(f"\n{'='*50}")
    print(f"SUMMARY")
    print(f"{'='*50}")
    print(f"Total word files created : {len(records)}")
    print(f"Topic index files created: {len(by_topic)}")
    print(f"Master index created     : 1")
    print(f"Total files created      : {files_created}")
    print(f"Total See also links     : {total_links}")
    print(f"Parse errors             : {len(errors)}")
    if collisions:
        print(f"Slug collisions (warned) : {len(collisions)}")

    # Sample output
    print(f"\nSample files:")
    samples = [
        WIKI_DIR / "business-commerce" / "brand-equity.md",
        WIKI_DIR / "finance-economics" / "gdp.md",
        WIKI_DIR / "law-regulation"    / "non-disclosure-agreement.md",
        WIKI_DIR / "formal-vocabulary" / "yield.md",
        WIKI_DIR / "social-issues-society" / "equity.md",
        WIKI_DIR / "business-commerce" / "equity.md",
    ]
    for s in samples:
        if s.exists():
            print(f"\n--- {s.relative_to(WIKI_DIR)} ---")
            print(s.read_text(encoding="utf-8"))
        else:
            print(f"  (not found: {s.relative_to(WIKI_DIR)})")


if __name__ == "__main__":
    main()
