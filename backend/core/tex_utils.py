from __future__ import annotations

import re
from pathlib import Path


def read_tex(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


def extract_series_title(tex: str) -> str:
    match = re.search(r"\\section\*?\s*\{([^}]*)\}", tex)
    if match:
        return match.group(1).strip()
    return ""


def extract_exercise_titles(tex: str) -> list[str]:
    titles = [m.group(1).strip() for m in re.finditer(r"\\exercise\s*\{([^}]*)\}", tex)]
    if titles:
        return titles

    titles = [m.group(1).strip() for m in re.finditer(r"\\uebung\s*\{([^}]*)\}", tex, re.IGNORECASE)]
    if titles:
        return titles

    titles = [m.group(1).strip() for m in re.finditer(r"\\subsection\*?\s*\{([^}]*)\}", tex)]
    if titles:
        return titles

    count = len(re.findall(r"\\begin\{exercise\}", tex, re.IGNORECASE))
    if count:
        return [f"Exercise {idx}" for idx in range(1, count + 1)]

    count = len(re.findall(r"\\begin\{problem\}", tex, re.IGNORECASE))
    if count:
        return [f"Exercise {idx}" for idx in range(1, count + 1)]

    return []

