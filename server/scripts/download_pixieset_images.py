#!/usr/bin/env python3
"""
Lee un archivo de texto con una URL por línea (p. ej. pixieset_image_urls.txt)
y descarga cada imagen a una carpeta local.
"""
from __future__ import annotations

import argparse
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def safe_filename_from_url(url: str) -> str:
    path = url.split("?", 1)[0].rstrip("/")
    name = path.rsplit("/", 1)[-1] if path else "image"
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    return name or "image.bin"


def read_urls(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    urls: list[str] = []
    for line in lines:
        u = line.strip()
        if not u or u.startswith("#"):
            continue
        if u.startswith("http://") or u.startswith("https://"):
            urls.append(u)
    return urls


def download_one(url: str, dest: Path, timeout: float) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; PixiesetDownloader/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        dest.write_bytes(resp.read())


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Descarga imágenes desde un listado de URLs (una por línea).")
    p.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Archivo .txt con URLs (una por línea)",
    )
    p.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=Path("pixieset_images"),
        help="Carpeta donde guardar las descargas",
    )
    p.add_argument(
        "--delay",
        type=float,
        default=0.15,
        help="Segundos de pausa entre descargas (0 para desactivar)",
    )
    p.add_argument("--timeout", type=float, default=60.0, help="Timeout por petición en segundos")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    url_file: Path = args.input
    if not url_file.is_file():
        print(f"No existe: {url_file}", file=sys.stderr)
        return 1

    urls = read_urls(url_file)
    if not urls:
        print("No se encontraron URLs en el archivo.", file=sys.stderr)
        return 1

    out_dir: Path = args.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    used_names: dict[str, int] = {}
    ok, fail = 0, 0

    for i, url in enumerate(urls, start=1):
        base = safe_filename_from_url(url)
        n = used_names.get(base, 0)
        used_names[base] = n + 1
        filename = base if n == 0 else f"{Path(base).stem}_{n + 1}{Path(base).suffix}"

        target = out_dir / filename
        try:
            print(f"[{i}/{len(urls)}] {url[:80]}...", flush=True)
            download_one(url, target, args.timeout)
            ok += 1
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            fail += 1

        if args.delay > 0 and i < len(urls):
            time.sleep(args.delay)

    print(f"Listo: {ok} descargadas, {fail} fallidas -> {out_dir.resolve()}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
