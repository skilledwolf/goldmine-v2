import re
from html import unescape
from html.parser import HTMLParser


_BLOCK_TAGS = {
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "dl",
    "dt",
    "dd",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tbody",
    "thead",
    "tr",
    "ul",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs):  # type: ignore[override]
        if tag in {"script", "style"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "br" or tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def html_to_raw_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html or "")
    raw = parser.text()
    return unescape(raw)


def html_to_text(html: str) -> str:
    return _normalize_whitespace(html_to_raw_text(html))


def split_html_by_heading(html: str, tag: str) -> list[str]:
    pattern = re.compile(rf"<{tag}\b[^>]*>", re.IGNORECASE)
    matches = list(pattern.finditer(html or ""))
    if not matches:
        return []

    chunks: list[str] = []
    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(html)
        chunk = html[start:end]
        footnotes = re.search(
            r"<section\b[^>]*class=[\"']?[^>]*footnotes[^>]*>",
            chunk,
            re.IGNORECASE,
        )
        if footnotes:
            chunk = chunk[:footnotes.start()]
        chunks.append(chunk)
    return chunks


def split_html_by_h2(html: str) -> list[str]:
    return split_html_by_heading(html, "h2")


def split_html_by_markers(html: str) -> list[str]:
    pattern = re.compile(r"<!--GMEX:(\d+)-->")
    matches = list(pattern.finditer(html or ""))
    if not matches:
        return []

    chunks: list[str] = []
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(html)
        chunk = html[start:end]
        chunks.append(chunk)
    return chunks


def split_tex_by_exercise(text: str) -> list[str]:
    pattern = re.compile(
        r"\\(?:exercise|uebung|subsection\*?|begin\{(?:problem|exercise)\})",
        re.IGNORECASE,
    )
    matches = list(pattern.finditer(text or ""))
    if not matches:
        return []

    chunks: list[str] = []
    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        chunks.append(text[start:end])
    return chunks


def _fit_chunks_to_count(chunks: list[str], expected_count: int) -> list[str]:
    if expected_count <= 0:
        return chunks
    if not chunks:
        return [""] * expected_count
    if len(chunks) == expected_count:
        return chunks
    if len(chunks) > expected_count:
        merged = chunks[: expected_count - 1]
        merged.append(" ".join(chunks[expected_count - 1 :]))
        return merged
    return chunks + [""] * (expected_count - len(chunks))


def extract_exercise_search_texts(html: str, expected_count: int | None = None) -> list[str]:
    candidates: list[list[str]] = []

    marker_chunks = split_html_by_markers(html)
    if marker_chunks:
        candidates.append([html_to_text(chunk) for chunk in marker_chunks])

    for tag in ("h2", "h3", "h1", "h4"):
        chunks = split_html_by_heading(html, tag)
        if chunks:
            candidates.append([html_to_text(chunk) for chunk in chunks])

    raw_text = html_to_raw_text(html)
    tex_chunks = split_tex_by_exercise(raw_text)
    if tex_chunks:
        candidates.append([_normalize_whitespace(chunk) for chunk in tex_chunks])
    else:
        text = _normalize_whitespace(raw_text)
        if text:
            candidates.append([text])

    if not candidates:
        return [""] * expected_count if expected_count else []

    if expected_count is None:
        return candidates[0]

    for candidate in candidates:
        if len(candidate) == expected_count:
            return candidate

    best = min(candidates, key=lambda c: abs(len(c) - expected_count))
    return _fit_chunks_to_count(best, expected_count)
