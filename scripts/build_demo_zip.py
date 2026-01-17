from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
import zipfile


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _write_minimal_pdf(path: Path, title: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [title, body]
    content_lines = []
    y = 720
    for line in lines:
        content_lines.append(
            f"BT /F1 14 Tf 72 {y} Td ({_pdf_escape(line)}) Tj ET"
        )
        y -= 24
    content = "\n".join(content_lines) + "\n"
    content_bytes = content.encode("latin-1")

    objects: list[bytes] = []
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    objects.append(
        b"3 0 obj\n"
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
        b"endobj\n"
    )
    objects.append(
        b"4 0 obj\n"
        + f"<< /Length {len(content_bytes)} >>\n".encode("ascii")
        + b"stream\n"
        + content_bytes
        + b"endstream\nendobj\n"
    )
    objects.append(
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]
    pos = len(header)
    for obj in objects:
        offsets.append(pos)
        pos += len(obj)

    xref_lines = ["xref", f"0 {len(objects) + 1}", "0000000000 65535 f "]
    for off in offsets[1:]:
        xref_lines.append(f"{off:010d} 00000 n ")
    xref = ("\n".join(xref_lines) + "\n").encode("ascii")

    trailer = (
        "trailer\n"
        f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        "startxref\n"
        f"{pos}\n"
        "%%EOF\n"
    ).encode("ascii")

    with open(path, "wb") as fh:
        fh.write(header)
        for obj in objects:
            fh.write(obj)
        fh.write(xref)
        fh.write(trailer)


def _ensure_demo_pdfs(root: Path) -> None:
    series_dirs = sorted([p for p in root.iterdir() if p.is_dir()])
    for idx, series_dir in enumerate(series_dirs, 1):
        number = idx
        sheet_pdf = series_dir / f"sheet_{number:02d}.pdf"
        solution_pdf = series_dir / f"solution_{number:02d}.pdf"
        if not sheet_pdf.exists():
            _write_minimal_pdf(
                sheet_pdf,
                f"Goldmine V2 Demo - Series {number}",
                "Placeholder PDF generated for demo uploads.",
            )
        if not solution_pdf.exists():
            _write_minimal_pdf(
                solution_pdf,
                f"Goldmine V2 Demo - Series {number} Solutions",
                "Placeholder PDF generated for demo uploads.",
            )


def _zip_folder(src: Path, dest_zip: Path) -> None:
    dest_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in src.rglob("*"):
            arcname = path.relative_to(src.parent)
            zf.write(path, arcname.as_posix())


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    source = repo_root / "backend" / "examples" / "demo_upload"
    if not source.exists():
        raise SystemExit(f"Demo source folder not found: {source}")

    with tempfile.TemporaryDirectory(prefix="goldmine-demo-zip-") as tmpdir:
        tmp_root = Path(tmpdir) / source.name
        shutil.copytree(source, tmp_root)
        _ensure_demo_pdfs(tmp_root)

        out_zip = repo_root / "backend" / "examples" / "demo_upload.zip"
        _zip_folder(tmp_root, out_zip)

    print(f"Wrote {out_zip}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
