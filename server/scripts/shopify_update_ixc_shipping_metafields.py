#!/usr/bin/env python3
"""
Actualiza metafields de envío (namespace IXC) en variantes de producto Shopify
mediante GraphQL metafieldsSet. Valores al azar con formato
{"value":"<numero>","unit":"<unidad>"} como en el admin.

Metafields (clave IXC.<key>):
  shipping_LengthEach, shipping_widthEach, shipping_heightEach -> unit cm
  shipping_weightEach -> unit kg
  shipping_volumeEach -> unit m3 (derivado de L×W×H en cm, coherente)

Entrada principal: JSON con filas { productId, variantId, sku } (ej. dockers-pe.json).

Variables de entorno: SHOPIFY_SHOP, SHOPIFY_ACCESS_TOKEN (o --shop / --token).

Uso:
  py -3 shopify_update_ixc_shipping_metafields.py dockers-pe.json \\
      --shop tu-tienda.myshopify.com --token shpat_xxx --dry-run

  py -3 shopify_update_ixc_shipping_metafields.py --shop ... --token ...
      (si existe dockers-pe.json junto al script, se usa solo)

  py -3 shopify_update_ixc_shipping_metafields.py --help
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

_ROOT = str(Path(__file__).resolve().parent)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

NAMESPACE = "IXC"
_DEFAULT_DOCKERS = Path(__file__).resolve().parent / "dockers-pe.json"

SHIPPING_SPECS: list[tuple[str, str]] = [
    ("shipping_LengthEach", "cm"),
    ("shipping_widthEach", "cm"),
    ("shipping_heightEach", "cm"),
    ("shipping_weightEach", "kg"),
    ("shipping_volumeEach", "m3"),
]

MUTATION = """
mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
    }
    userErrors {
      field
      message
    }
  }
}
"""


def normalize_shop(shop: str) -> str:
    shop = shop.strip()
    if "://" in shop:
        parsed = urlparse(shop)
        host = parsed.netloc or parsed.path
        return host.split("/")[0].strip()
    return shop.rstrip("/")


def to_variant_gid(variant_id: str) -> str:
    s = variant_id.strip()
    if s.startswith("gid://"):
        return s
    numeric = s.rsplit("/", 1)[-1]
    if not numeric.isdigit():
        raise ValueError(f"ID de variante no válido: {variant_id!r}")
    return f"gid://shopify/ProductVariant/{numeric}"


def post_graphql(
    conn: http.client.HTTPSConnection,
    api_version: str,
    token: str,
    query: str,
    variables: dict[str, Any],
) -> dict[str, Any]:
    path = f"/admin/api/{api_version}/graphql.json"
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
        "Content-Length": str(len(body)),
        "Accept": "application/json",
    }
    conn.request("POST", path, body=body, headers=headers)
    resp = conn.getresponse()
    raw = resp.read().decode("utf-8")
    if resp.status >= 400:
        raise RuntimeError(f"HTTP {resp.status}: {raw[:800]}")
    return json.loads(raw)


def format_metric_value(n: float) -> str:
    """
    Valor numérico como texto: punto como separador decimal y como máximo 2 decimales
    (siempre 2 cifras fraccionarias, ej. 10.50, 59.00).
    """
    return f"{round(float(n), 2):.2f}"


def random_shipping_payload() -> dict[str, dict[str, str]]:
    length = round(random.uniform(8, 120), 2)
    width = round(random.uniform(5, 80), 2)
    height = round(random.uniform(5, 80), 2)
    wkg = round(random.uniform(0.08, 12.0), 2)
    vol_m3 = (length * width * height) / 1_000_000.0
    volume = round(vol_m3, 2)
    fmt = format_metric_value
    return {
        "shipping_LengthEach": {"value": fmt(length), "unit": "cm"},
        "shipping_widthEach": {"value": fmt(width), "unit": "cm"},
        "shipping_heightEach": {"value": fmt(height), "unit": "cm"},
        "shipping_weightEach": {"value": fmt(wkg), "unit": "kg"},
        "shipping_volumeEach": {"value": fmt(volume), "unit": "m3"},
    }


def build_metafields_inputs(
    owner_gid: str,
    payload: dict[str, dict[str, str]],
    metafield_type: str,
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for key, _unit in SHIPPING_SPECS:
        inner = payload[key]
        value_str = json.dumps(inner, separators=(",", ":"))
        out.append(
            {
                "ownerId": owner_gid,
                "namespace": NAMESPACE,
                "key": key,
                "type": metafield_type,
                "value": value_str,
            }
        )
    return out


def load_variant_rows_from_json(path: Path) -> list[dict[str, Any]]:
    """dockers-pe.json: [{ productId, variantId, sku }, ...]"""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("El JSON debe ser un array de objetos con variantId")
    rows: list[dict[str, Any]] = []
    for row in data:
        if isinstance(row, dict) and row.get("variantId"):
            rows.append(
                {
                    "variantId": str(row["variantId"]),
                    "sku": row.get("sku"),
                    "productId": row.get("productId"),
                }
            )
        elif isinstance(row, str):
            rows.append({"variantId": row, "sku": None, "productId": None})
    return rows


def dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        vid = r["variantId"]
        if vid not in seen:
            seen.add(vid)
            out.append(r)
    return out


def fetch_all_variant_rows(shop: str, token: str, api_version: str) -> list[dict[str, Any]]:
    import shopify_list_variants as slv

    raw = slv.get_all_product_variants(shop, token, api_version)
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in raw:
        vid = r.get("variantId")
        if not vid:
            continue
        key = str(vid)
        if key in seen:
            continue
        seen.add(key)
        out.append({"variantId": key, "sku": r.get("sku"), "productId": r.get("productId")})
    return out


def collect_json_files(args: argparse.Namespace) -> list[Path]:
    files: list[Path] = []
    if getattr(args, "variants_json", None) is not None:
        files.append(args.variants_json)
    if args.from_json is not None:
        if args.from_json not in files:
            files.append(args.from_json)
    if not files and not (args.variant_ids or []) and not args.all_variants:
        if _DEFAULT_DOCKERS.is_file():
            files.append(_DEFAULT_DOCKERS)
    return files


def process_rows(
    rows: list[dict[str, Any]],
    host: str,
    token: str,
    api_version: str,
    metafield_type: str,
    dry_run: bool,
    delay: float,
) -> tuple[int, int]:
    ok, err = 0, 0
    n = len(rows)
    for i, row in enumerate(rows, start=1):
        raw_id = row["variantId"]
        sku = row.get("sku") or ""
        try:
            gid = to_variant_gid(raw_id)
        except ValueError as e:
            print(f"Omitido {raw_id!r}: {e}", file=sys.stderr)
            err += 1
            continue

        payload = random_shipping_payload()
        inputs = build_metafields_inputs(gid, payload, metafield_type)
        sku_bit = f" sku={sku}" if sku else ""
        print(f"\n[{i}/{n}] {gid}{sku_bit}", flush=True)
        if dry_run:
            print(json.dumps(payload, indent=2, ensure_ascii=False))
            print("  → simulación (--dry-run): no se ha enviado nada a Shopify.", flush=True)
            ok += 1
            continue

        conn = http.client.HTTPSConnection(host, timeout=120)
        try:
            resp = post_graphql(conn, api_version, token, MUTATION, {"metafields": inputs})
        finally:
            conn.close()

        if resp.get("errors"):
            print(json.dumps(resp["errors"], indent=2), file=sys.stderr)
            err += 1
            continue

        data = resp.get("data") or {}
        mset = data.get("metafieldsSet") or {}
        uerr = mset.get("userErrors") or []
        if uerr:
            print(json.dumps(uerr, indent=2, ensure_ascii=False), file=sys.stderr)
            err += 1
        else:
            ok += 1
            print("  OK", len(mset.get("metafields") or []), "metafields")

        if delay > 0 and i < n:
            time.sleep(delay)

    return ok, err


def main() -> int:
    p = argparse.ArgumentParser(
        description="Actualiza metafields IXC de shipping en variantes (valores aleatorios)."
    )
    p.add_argument(
        "variants_json",
        nargs="?",
        type=Path,
        default=None,
        metavar="VARIANTS_JSON",
        help="JSON con productId, variantId y sku por fila (ej. dockers-pe.json)",
    )
    p.add_argument("--shop", default=os.environ.get("SHOPIFY_SHOP", ""))
    p.add_argument("--token", default=os.environ.get("SHOPIFY_ACCESS_TOKEN", ""))
    p.add_argument("--api-version", default="2024-01")
    p.add_argument(
        "--metafield-type",
        default="json",
        help='Tipo Shopify del metafield ("json" o "single_line_text_field")',
    )
    p.add_argument(
        "--variant-id",
        action="append",
        dest="variant_ids",
        default=[],
        metavar="ID",
        help="ID numérico o GID de variante (se puede repetir)",
    )
    p.add_argument(
        "--from-json",
        type=Path,
        metavar="FILE",
        help="Otro JSON de variantes (se combina con VARIANTS_JSON si ambos existen)",
    )
    p.add_argument(
        "--all-variants",
        action="store_true",
        help="Recorre TODAS las variantes de la tienda (peligroso)",
    )
    p.add_argument(
        "--i-understand",
        action="store_true",
        help="Obligatorio junto con --all-variants",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo muestra qué se enviaría: NO llama a Shopify (el admin no cambiará)",
    )
    p.add_argument("--seed", type=int, default=None, help="Semilla para valores reproducibles")
    p.add_argument("--delay", type=float, default=0.35, help="Pausa en segundos entre variantes")
    p.add_argument("--max", type=int, default=0, help="Máximo de variantes a procesar (0 = sin límite)")
    args = p.parse_args()

    if not args.shop or not args.token:
        print("Faltan --shop / --token o SHOPIFY_SHOP / SHOPIFY_ACCESS_TOKEN.", file=sys.stderr)
        return 1

    if args.all_variants and not args.i_understand:
        print("Para --all-variants debe añadir también --i-understand.", file=sys.stderr)
        return 1

    rows: list[dict[str, Any]] = []

    for fp in collect_json_files(args):
        if not fp.is_file():
            print(f"No existe el archivo: {fp}", file=sys.stderr)
            return 1
        rows.extend(load_variant_rows_from_json(fp))

    for vid in args.variant_ids or []:
        rows.append({"variantId": str(vid), "sku": None, "productId": None})

    if args.all_variants:
        print("Obteniendo lista de variantes...", flush=True)
        rows.extend(fetch_all_variant_rows(args.shop, args.token, args.api_version))

    rows = dedupe_rows(rows)

    if args.max and args.max > 0:
        rows = rows[: args.max]

    if not rows:
        print(
            "No hay variantes: pase VARIANTS_JSON (ej. dockers-pe.json), --from-json, "
            "--variant-id, deje dockers-pe.json junto al script, o --all-variants --i-understand.",
            file=sys.stderr,
        )
        return 1

    if args.seed is not None:
        random.seed(args.seed)

    if args.dry_run:
        print(
            "\n*** MODO --dry-run ***\n"
            "No se harán peticiones a la API: la tienda y el admin NO se modifican.\n"
            "Para grabar metafields, ejecuta el mismo comando SIN --dry-run.\n"
            "***\n",
            flush=True,
        )

    host = normalize_shop(args.shop)
    ok, err = process_rows(
        rows,
        host,
        args.token,
        args.api_version,
        args.metafield_type,
        args.dry_run,
        args.delay,
    )

    if args.dry_run:
        print(
            f"\nResumen: {ok} variante(s) solo simulada(s). "
            "Nada guardado en Shopify (ejecutaste con --dry-run)."
        )
    else:
        print(f"\nResumen: {ok} OK, {err} con error / omitidas.")
    return 0 if err == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
