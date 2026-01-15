from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseForbidden
from ninja import Router
from .models import Series
from pathlib import Path
from urllib.parse import unquote
import hashlib
import mimetypes
import os
import re
import subprocess
import tempfile
import zipfile

files_router = Router()


PDF_PREVIEW_CACHE_DIR = Path("/tmp/goldmine_pdf_previews")
RENDERED_ASSET_ROOT = Path(settings.MEDIA_ROOT) / "latexml-assets"
PDF_TO_PNG_TIMEOUT = int(os.getenv("PDF_TO_PNG_TIMEOUT_SECONDS", "20"))
PDF_INFO_TIMEOUT = int(os.getenv("PDF_INFO_TIMEOUT_SECONDS", "10"))


def _safe_file_response(file_path: Path) -> FileResponse:
    content_type, _ = mimetypes.guess_type(str(file_path))
    fh = open(file_path, "rb")
    return FileResponse(fh, as_attachment=False, content_type=content_type or "application/octet-stream")


def _case_insensitive_file(candidate: Path) -> Path | None:
    try:
        parent = candidate.parent
        if not parent.is_dir():
            return None
        wanted = candidate.name.lower()
        for child in parent.iterdir():
            if child.is_file() and child.name.lower() == wanted:
                return child
    except OSError:
        return None
    return None


def _find_asset_file(semester_root: Path, tex_dir: Path, ref: str) -> Path:
    cleaned = (ref or "").strip()
    if not cleaned:
        raise Http404("Missing ref")

    cleaned = unquote(cleaned)
    cleaned = cleaned.split("?", 1)[0].split("#", 1)[0]
    # HTML can contain root-relative refs (e.g. "/fig/foo"); treat them as
    # semester-root relative to avoid accidental absolute filesystem paths.
    cleaned = cleaned.lstrip("/")

    # Basic candidates (relative to TeX directory)
    base = Path(cleaned)
    candidates: list[Path] = []

    def add_variants(p: Path):
        if p.suffix:
            suffix = p.suffix.lower()
            if suffix in {".eps", ".ps"}:
                stem = p.with_suffix("")
                # Prefer converted PDFs over the raw EPS/PS, since browsers can't render
                # PostScript reliably. TeX toolchains often generate `-eps-converted-to.pdf`.
                candidates.append(stem.with_suffix(".pdf"))
                candidates.append(stem.with_name(stem.name + "-eps-converted-to.pdf"))
                candidates.append(stem.with_name(stem.name + ".eps-converted-to.pdf"))
                candidates.append(p)
                return

            candidates.append(p)
            return

        candidates.append(p)
        for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf"]:
            candidates.append(p.with_suffix(ext))
        candidates.append(p.with_name(p.name + "-eps-converted-to.pdf"))
        candidates.append(p.with_name(p.name + ".eps-converted-to.pdf"))

    common_folders = ["images", "image", "fig", "figs", "figure", "figures", "img", "imgs"]

    # Primary: resolve relative to the TeX file directory.
    add_variants(tex_dir / base)

    # Many legacy TeX trees compile from the semester root (or other working directories),
    # so also try resolving the same ref while walking up from tex_dir to semester_root.
    semester_root_resolved = semester_root.resolve()
    cur = tex_dir
    while True:
        try:
            cur_resolved = cur.resolve()
        except OSError:
            break
        if cur_resolved.is_relative_to(semester_root_resolved):
            add_variants(cur / base)
        if cur_resolved == semester_root_resolved or cur.parent == cur:
            break
        cur = cur.parent

    # If ref didn't include a directory, also try common figure folders and walk upwards.
    # Many legacy TeX files compile from the semester root and keep shared assets (e.g. ETHLogo)
    # in parent directories.
    if base.parent == Path("."):
        # Search in current and common subfolders first
        for folder in common_folders:
            add_variants(tex_dir / folder / base)

        # Walk upwards to semester_root (inclusive)
        cur = tex_dir
        while True:
            try:
                cur_resolved = cur.resolve()
            except OSError:
                break
            if cur_resolved.is_relative_to(semester_root_resolved):
                for folder in common_folders:
                    add_variants(cur / folder / base)
            if cur_resolved == semester_root_resolved or cur.parent == cur:
                break
            cur = cur.parent

    # If the ref contains path segments but nothing was found, fall back to trying just the
    # basename. This helps for files that compile from a different working directory.
    if base.parent != Path("."):
        add_variants(tex_dir / base.name)
        cur = tex_dir
        while True:
            try:
                cur_resolved = cur.resolve()
            except OSError:
                break
            if cur_resolved.is_relative_to(semester_root_resolved):
                add_variants(cur / base.name)
                for folder in common_folders:
                    add_variants(cur / folder / base.name)
            if cur_resolved == semester_root_resolved or cur.parent == cur:
                break
            cur = cur.parent

    semester_root_resolved = semester_root.resolve()
    for cand in candidates:
        try:
            resolved = cand.resolve()
        except OSError:
            continue
        if not resolved.is_file():
            alt = _case_insensitive_file(cand)
            if not alt:
                continue
            try:
                resolved = alt.resolve()
            except OSError:
                continue
            if not resolved.is_file():
                continue
        if not resolved.is_relative_to(semester_root_resolved):
            continue
        return resolved

    raise Http404("Asset not found")


def _find_rendered_asset_file(series_id: int, ref: str) -> Path | None:
    cleaned = (ref or "").strip()
    if not cleaned:
        return None

    cleaned = unquote(cleaned)
    cleaned = cleaned.split("?", 1)[0].split("#", 1)[0]
    cleaned = cleaned.lstrip("/")

    root = RENDERED_ASSET_ROOT / str(series_id)
    base = Path(cleaned)

    candidates: list[Path] = []

    def add_variants(p: Path):
        if p.suffix:
            candidates.append(p)
            return
        candidates.append(p)
        for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf"]:
            candidates.append(p.with_suffix(ext))

    add_variants(root / base)

    try:
        root_resolved = root.resolve()
    except OSError:
        root_resolved = root

    for cand in candidates:
        try:
            resolved = cand.resolve()
        except OSError:
            continue
        if not resolved.is_file():
            alt = _case_insensitive_file(cand)
            if not alt:
                continue
            try:
                resolved = alt.resolve()
            except OSError:
                continue
            if not resolved.is_file():
                continue
        if not resolved.is_relative_to(root_resolved):
            continue
        return resolved

    return None


def _pdf_to_png(pdf_path: Path, page: int = 1) -> Path:
    PDF_PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        stat = pdf_path.stat()
        salt = f"{pdf_path}:{stat.st_mtime_ns}:{page}".encode("utf-8")
    except OSError:
        salt = f"{pdf_path}:{page}".encode("utf-8")

    key = hashlib.sha256(salt).hexdigest()[:20]
    out_base = PDF_PREVIEW_CACHE_DIR / f"{key}"
    out_png = PDF_PREVIEW_CACHE_DIR / f"{key}.png"
    if out_png.exists():
        return out_png

    cmd = [
        "pdftocairo",
        "-png",
        "-singlefile",
        "-f",
        str(page),
        "-l",
        str(page),
        str(pdf_path),
        str(out_base),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=PDF_TO_PNG_TIMEOUT)
    except FileNotFoundError as exc:
        raise Http404("PDF preview unavailable (missing pdftocairo)") from exc
    except subprocess.TimeoutExpired as exc:
        raise Http404("PDF conversion timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise Http404(f"PDF conversion failed: {(exc.stderr or '').strip()[:200]}") from exc
    if not out_png.exists():
        raise Http404("PDF conversion failed")
    return out_png


def _pdf_page_count(pdf_path: Path) -> int:
    cmd = ["pdfinfo", str(pdf_path)]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=PDF_INFO_TIMEOUT)
    except FileNotFoundError as exc:
        raise Http404("PDF metadata unavailable (missing pdfinfo)") from exc
    except subprocess.TimeoutExpired as exc:
        raise Http404("PDF metadata unavailable (timeout)") from exc
    except subprocess.CalledProcessError as exc:
        raise Http404(f"PDF metadata unavailable: {(exc.stderr or '').strip()[:200]}") from exc

    match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout or "", flags=re.MULTILINE)
    if not match:
        raise Http404("PDF metadata unavailable")
    pages = int(match.group(1))
    if pages <= 0:
        raise Http404("PDF metadata unavailable")
    return pages


@files_router.get("/{series_id}/pdf-meta")
def get_pdf_meta(request, series_id: int, file: str = "pdf"):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Authentication required")

    if file not in {"pdf", "solution"}:
        raise Http404("Invalid file type")

    try:
        series = Series.objects.select_related("semester_group").get(id=series_id)
    except Series.DoesNotExist:
        raise Http404("Series not found")

    fs_path = series.semester_group.fs_path
    target_file = series.pdf_file if file == "pdf" else series.solution_file
    if not fs_path or not target_file:
        raise Http404("PDF not available for this series")

    semester_root = Path(settings.LECTURE_MEDIA_ROOT) / fs_path
    pdf_path = semester_root / target_file

    try:
        semester_root_resolved = semester_root.resolve()
        pdf_resolved = pdf_path.resolve()
    except OSError as exc:
        raise Http404("PDF not available") from exc

    if not pdf_resolved.is_relative_to(semester_root_resolved):
        raise Http404("PDF not available")
    if not pdf_resolved.is_file():
        raise Http404("PDF not available")

    return {"pages": _pdf_page_count(pdf_resolved)}


@files_router.get("/{series_id}/pdf-preview")
def get_pdf_preview(request, series_id: int, page: int = 1, file: str = "pdf"):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Authentication required")

    if file not in {"pdf", "solution"}:
        raise Http404("Invalid file type")

    if page < 1:
        raise Http404("Invalid page number")

    try:
        series = Series.objects.select_related("semester_group").get(id=series_id)
    except Series.DoesNotExist:
        raise Http404("Series not found")

    fs_path = series.semester_group.fs_path
    target_file = series.pdf_file if file == "pdf" else series.solution_file
    if not fs_path or not target_file:
        raise Http404("PDF not available for this series")

    semester_root = Path(settings.LECTURE_MEDIA_ROOT) / fs_path
    pdf_path = semester_root / target_file

    try:
        semester_root_resolved = semester_root.resolve()
        pdf_resolved = pdf_path.resolve()
    except OSError as exc:
        raise Http404("PDF not available") from exc

    if not pdf_resolved.is_relative_to(semester_root_resolved):
        raise Http404("PDF not available")
    if not pdf_resolved.is_file():
        raise Http404("PDF not available")

    png = _pdf_to_png(pdf_resolved, page=page)
    return _safe_file_response(png)


@files_router.get("/{series_id}/asset")
def get_asset(request, series_id: int, ref: str, page: int = 1):
    """
    Resolve and serve an asset referenced by the rendered HTML (typically \\includegraphics).

    - `ref` is the raw `src` value from the HTML output (often extension-less).
    - PDF assets are converted to a PNG preview (first page by default).
    """
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Authentication required")

    try:
        series = Series.objects.select_related("semester_group").get(id=series_id)
    except Series.DoesNotExist:
        raise Http404("Series not found")

    fs_path = series.semester_group.fs_path
    if not fs_path or not series.tex_file:
        raise Http404("File path configuration error")

    semester_root = Path(settings.LECTURE_MEDIA_ROOT) / fs_path
    tex_abs = semester_root / series.tex_file
    tex_dir = tex_abs.parent

    rendered_asset = _find_rendered_asset_file(series_id=series_id, ref=ref)
    if rendered_asset is not None:
        if rendered_asset.suffix.lower() == ".pdf":
            png = _pdf_to_png(rendered_asset, page=page)
            return _safe_file_response(png)
        return _safe_file_response(rendered_asset)

    asset_path = _find_asset_file(semester_root=semester_root, tex_dir=tex_dir, ref=ref)
    if asset_path.suffix.lower() == ".pdf":
        png = _pdf_to_png(asset_path, page=page)
        return _safe_file_response(png)

    # For eps/ps we try to map to a converted pdf above; if not found, we won't be here.
    return _safe_file_response(asset_path)


@files_router.get("/{series_id}/{file_type}")
def get_file(request, series_id: int, file_type: str):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Authentication required")

    try:
        series = Series.objects.select_related("semester_group").get(id=series_id)
    except Series.DoesNotExist:
        raise Http404("Series not found")

    filename = None
    if file_type == "tex":
        filename = series.tex_file
    elif file_type == "pdf":
        filename = series.pdf_file
    elif file_type == "solution":
        filename = series.solution_file
    else:
        raise Http404("Invalid file type")

    if not filename:
        raise Http404("File not available for this series")

    # Construct Path
    # Format: LECTURE_MEDIA_ROOT / <fs_path> / <filename>
    # Note: fs_path comes from SemesterGroup
    fs_path = series.semester_group.fs_path
    if not fs_path:
        raise Http404("File path configuration error")

    root = Path(settings.LECTURE_MEDIA_ROOT)
    try:
        file_path = _ensure_under_root(root / fs_path / filename, root)
    except Http404:
        raise

    if not file_path.is_file():
        raise Http404("File not found on server")

    return FileResponse(open(file_path, "rb"), as_attachment=True, filename=filename)


def _ensure_under_root(path: Path, root: Path) -> Path:
    try:
        resolved = path.resolve()
        root_resolved = root.resolve()
    except OSError:
        raise Http404("Invalid path")
    if not resolved.is_relative_to(root_resolved):
        raise Http404("Invalid path")
    return resolved


def _zip_directory(dir_path: Path, archive_name: str) -> FileResponse:
    if not dir_path.is_dir():
        raise Http404("Directory not found")

    tmp = tempfile.SpooledTemporaryFile(max_size=100 * 1024 * 1024)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(dir_path):
            for fname in files:
                full = Path(root) / fname
                rel = full.relative_to(dir_path)
                zf.write(full, arcname=str(rel))
    tmp.seek(0)
    return FileResponse(
        tmp,
        as_attachment=True,
        filename=f"{archive_name}.zip",
        content_type="application/zip",
    )


@files_router.get("/semester/{semester_group_id}/zip")
def download_semester_zip(request, semester_group_id: int):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Authentication required")

    from .models import SemesterGroup  # local import to avoid cycle

    try:
        sg = SemesterGroup.objects.select_related("lecture").get(id=semester_group_id)
    except SemesterGroup.DoesNotExist:
        raise Http404("Semester not found")

    if not sg.fs_path:
        raise Http404("Semester path is not configured")

    root = Path(settings.LECTURE_MEDIA_ROOT)
    semester_root = _ensure_under_root(root / sg.fs_path, root)
    archive_name = f"{sg.lecture.name}_{sg.semester}{sg.year}"
    return _zip_directory(semester_root, archive_name)


@files_router.get("/series/{series_id}/zip")
def download_series_zip(request, series_id: int):
    if not request.user.is_authenticated:
        return HttpResponseForbidden("Authentication required")

    try:
        series = Series.objects.select_related("semester_group__lecture").get(id=series_id)
    except Series.DoesNotExist:
        raise Http404("Series not found")

    sg = series.semester_group
    if not sg.fs_path:
        raise Http404("Semester path is not configured")

    root = Path(settings.LECTURE_MEDIA_ROOT)
    semester_root = _ensure_under_root(root / sg.fs_path, root)

    candidates: list[Path] = []
    for rel in [series.tex_file, series.pdf_file, series.solution_file]:
        if rel:
            candidates.append(semester_root / rel)
    base_dir = semester_root
    for cand in candidates:
        try:
            cand_resolved = _ensure_under_root(cand, semester_root)
        except Http404:
            continue
        parent = cand_resolved.parent
        if parent.is_dir():
            base_dir = parent
            break

    archive_name = f"{sg.lecture.name}_{sg.semester}{sg.year}_S{series.number}"
    return _zip_directory(base_dir, archive_name)
