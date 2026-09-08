#!/usr/bin/env python3
"""
Exporta todos los productos y sus variantes desde Shopify Admin GraphQL a un Excel (.xlsx)
para el área comercial, incluyendo todos los metafields de cada variante y columnas IXC de shipping.

Requiere: pip install openpyxl

Variables de entorno: SHOPIFY_SHOP, SHOPIFY_ACCESS_TOKEN (o --shop / --token).

Uso:
  py -3 shopify_products_variants_excel.py --shop tu-tienda.myshopify.com --token shpat_xxx
  py -3 shopify_products_variants_excel.py -o catalogo.xlsx
  py -3 shopify_products_variants_excel.py --help
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

_ROOT = str(Path(__file__).resolve().parent)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from shopify_list_variants import post_graphql, normalize_shop

# Mismo orden que shopify_update_ixc_shipping_metafields.py (namespace IXC)
IXC_SHIPPING_KEYS = [
    "shipping_LengthEach",
    "shipping_widthEach",
    "shipping_heightEach",
    "shipping_weightEach",
    "shipping_volumeEach",
]

METAFIELDS_FRAGMENT = """
              metafields(first: 50) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
"""

VARIANT_METAFIELDS_PAGE_QUERY = """
query VariantMetafieldsPage($id: ID!, $cursor: String!) {
  productVariant(id: $id) {
    id
    metafields(first: 250, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          namespace
          key
          value
          type
        }
      }
    }
  }
}
"""

PRODUCTS_PAGE_QUERY = """
query ProductsForExport($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo {
      hasNextPage
    }
    edges {
      cursor
      node {
        id
        title
        handle
        status
        vendor
        productType
        variants(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              inventoryQuantity
              selectedOptions {
                name
                value
              }
""" + METAFIELDS_FRAGMENT + """
            }
          }
        }
      }
    }
  }
}
"""

VARIANTS_PAGE_QUERY = """
query ProductVariantsPage($id: ID!, $cursor: String!) {
  product(id: $id) {
    id
    variants(first: 250, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          sku
          barcode
          price
          compareAtPrice
          inventoryQuantity
          selectedOptions {
            name
            value
          }
""" + METAFIELDS_FRAGMENT + """
        }
      }
    }
  }
}
"""

HEADERS_ES = [
    "ID producto",
    "Producto",
    "Handle",
    "Estado",
    "Vendor",
    "Tipo producto",
    "ID variante",
    "Título variante",
    "SKU",
    "Código de barras",
    "Opción 1",
    "Opción 2",
    "Opción 3",
    "Precio",
    "Precio comparación",
    "Inventario",
    "IXC shipping_LengthEach",
    "IXC shipping_widthEach",
    "IXC shipping_heightEach",
    "IXC shipping_weightEach",
    "IXC shipping_volumeEach",
    "Todos los metafields (JSON)",
]


def metafield_nodes_from_block(block: dict[str, Any] | None) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for edge in (block or {}).get("edges") or []:
        if not isinstance(edge, dict):
            continue
        node = edge.get("node") or {}
        if node.get("key"):
            nodes.append(node)
    return nodes


def metafield_nodes(vnode: dict[str, Any]) -> list[dict[str, Any]]:
    return metafield_nodes_from_block(vnode.get("metafields") if isinstance(vnode, dict) else None)


def ixc_shipping_map(nodes: list[dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for node in nodes:
        if str(node.get("namespace") or "") != "IXC":
            continue
        k = node.get("key")
        if k:
            out[str(k)] = node.get("value") if node.get("value") is not None else ""
    return out


def ixc_shipping_columns(m: dict[str, str]) -> list[Any]:
    return [m.get(key, "") for key in IXC_SHIPPING_KEYS]


def all_metafields_json(nodes: list[dict[str, Any]]) -> str:
    payload = [
        {
            "namespace": n.get("namespace") or "",
            "key": n.get("key"),
            "type": n.get("type") or "",
            "value": n.get("value") if n.get("value") is not None else "",
        }
        for n in nodes
    ]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")) if payload else ""


def gid_numeric(gid: str | None) -> str:
    if not gid or not isinstance(gid, str):
        return ""
    m = re.search(r"/(\d+)\s*$", gid)
    return m.group(1) if m else gid


def variant_to_row(product: dict[str, Any], vnode: dict[str, Any]) -> list[Any]:
    opts = vnode.get("selectedOptions") or []
    ovals: list[str | None] = [None, None, None]
    for i, o in enumerate(opts[:3]):
        if isinstance(o, dict):
            ovals[i] = o.get("value")

    inv = vnode.get("inventoryQuantity")
    if inv is None:
        inv_str = ""
    else:
        inv_str = int(inv) if isinstance(inv, (int, float)) else str(inv)

    mnodes = metafield_nodes(vnode)
    ixm = ixc_shipping_map(mnodes)

    return [
        gid_numeric(product.get("id")),
        product.get("title") or "",
        product.get("handle") or "",
        str(product.get("status") or ""),
        product.get("vendor") or "",
        product.get("productType") or "",
        gid_numeric(vnode.get("id")),
        vnode.get("title") or "",
        vnode.get("sku") or "",
        vnode.get("barcode") or "",
        ovals[0] or "",
        ovals[1] or "",
        ovals[2] or "",
        vnode.get("price") or "",
        vnode.get("compareAtPrice") or "",
        inv_str,
        *ixc_shipping_columns(ixm),
        all_metafields_json(mnodes),
    ]


def collect_variant_nodes(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data") or {}
    root = data.get("product")
    if not root:
        return []
    var_block = root.get("variants") or {}
    edges = var_block.get("edges") or []
    return [e.get("node") or {} for e in edges if isinstance(e, dict)]


def fetch_all_variant_nodes_for_product(
    conn: http.client.HTTPSConnection,
    api_version: str,
    token: str,
    product_id: str,
    first_block: dict[str, Any],
) -> list[dict[str, Any]]:
    """Primera página ya en first_block['variants']; pide el resto si hace falta."""
    variants_root = first_block.get("variants") or {}
    nodes: list[dict[str, Any]] = []
    edges = variants_root.get("edges") or []
    nodes.extend(e.get("node") or {} for e in edges if isinstance(e, dict))

    pinfo = variants_root.get("pageInfo") or {}
    vcursor = pinfo.get("endCursor")
    while pinfo.get("hasNextPage") and vcursor:
        time.sleep(0.15)
        resp = post_graphql(
            conn,
            api_version,
            token,
            VARIANTS_PAGE_QUERY,
            {"id": product_id, "cursor": vcursor},
        )
        if resp.get("errors"):
            raise RuntimeError(json.dumps(resp["errors"], indent=2))
        chunk = collect_variant_nodes(resp)
        if not chunk:
            break
        nodes.extend(chunk)
        data = resp.get("data") or {}
        prod = data.get("product") or {}
        vroot = prod.get("variants") or {}
        pinfo = vroot.get("pageInfo") or {}
        vcursor = pinfo.get("endCursor")

    for vnode in nodes:
        ensure_all_variant_metafields(conn, api_version, token, vnode)

    return nodes


def ensure_all_variant_metafields(
    conn: http.client.HTTPSConnection,
    api_version: str,
    token: str,
    vnode: dict[str, Any],
) -> None:
    """Une páginas extra de metafields en vnode['metafields']['edges']."""
    variant_id = vnode.get("id")
    block = vnode.get("metafields") if isinstance(vnode.get("metafields"), dict) else {}
    if not block:
        vnode["metafields"] = {"edges": [], "pageInfo": {}}
        return

    pinfo = block.get("pageInfo") or {}
    cursor = pinfo.get("endCursor")
    edges = list(block.get("edges") or [])

    while variant_id and pinfo.get("hasNextPage") and cursor:
        time.sleep(0.1)
        resp = post_graphql(
            conn,
            api_version,
            token,
            VARIANT_METAFIELDS_PAGE_QUERY,
            {"id": variant_id, "cursor": cursor},
        )
        if resp.get("errors"):
            raise RuntimeError(json.dumps(resp["errors"], indent=2))
        data = resp.get("data") or {}
        pv = data.get("productVariant") or {}
        nxt = pv.get("metafields") or {}
        extra = nxt.get("edges") or []
        if not extra:
            break
        edges.extend(extra)
        pinfo = nxt.get("pageInfo") or {}
        cursor = pinfo.get("endCursor")

    vnode["metafields"] = {"edges": edges, "pageInfo": pinfo}


def iter_product_variant_rows(
    shop: str,
    token: str,
    api_version: str,
    page_delay: float,
) -> list[list[Any]]:
    host = normalize_shop(shop)
    rows: list[list[Any]] = []
    cursor: str | None = None
    has_next = True

    conn = http.client.HTTPSConnection(host, timeout=180)
    try:
        page = 0
        while has_next:
            page += 1
            if page > 1 and page_delay > 0:
                time.sleep(page_delay)

            payload = post_graphql(conn, api_version, token, PRODUCTS_PAGE_QUERY, {"cursor": cursor})
            if payload.get("errors"):
                raise RuntimeError(json.dumps(payload["errors"], indent=2))

            data = payload.get("data") or {}
            products = data.get("products") or {}
            edges = products.get("edges") or []

            for edge in edges:
                product = (edge.get("node") or {}) if isinstance(edge, dict) else {}
                pid = product.get("id")
                if not pid:
                    continue

                variant_nodes = fetch_all_variant_nodes_for_product(
                    conn, api_version, token, pid, product
                )
                if not variant_nodes:
                    rows.append(variant_to_row(product, {}))
                    continue
                for vnode in variant_nodes:
                    rows.append(variant_to_row(product, vnode))

            pinfo = products.get("pageInfo") or {}
            has_next = bool(pinfo.get("hasNextPage"))
            cursor = edges[-1].get("cursor") if edges else None
            if has_next and not cursor:
                raise RuntimeError("products: hasNextPage sin cursor")
            print(f"Página productos {page}, filas acumuladas: {len(rows)}", flush=True)
    finally:
        conn.close()

    return rows


def write_xlsx(path: Path, headers: list[str], rows: list[list[Any]]) -> None:
    try:
        from openpyxl import Workbook
        from openpyxl.utils import get_column_letter
    except ImportError as e:
        raise SystemExit(
            "Falta openpyxl. Instale con: py -3 -m pip install openpyxl\n" + str(e)
        ) from e

    wb = Workbook()
    ws = wb.active
    ws.title = "Variantes"
    ws.append(headers)
    for r in rows:
        ws.append(list(r))

    ws.freeze_panes = "A2"
    last_row = max(1, len(rows) + 1)
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{last_row}"

    widths = (
        14,
        36,
        22,
        12,
        18,
        22,
        14,
        28,
        18,
        18,
        14,
        14,
        14,
        12,
        18,
        10,
        22,
        22,
        22,
        22,
        22,
        40,
    )
    for i in range(1, len(headers) + 1):
        w = widths[i - 1] if i <= len(widths) else 18
        ws.column_dimensions[get_column_letter(i)].width = w

    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def main() -> int:
    p = argparse.ArgumentParser(
        description="Exporta productos y variantes Shopify a Excel (.xlsx)."
    )
    p.add_argument("--shop", default=os.environ.get("SHOPIFY_SHOP", ""))
    p.add_argument("--token", default=os.environ.get("SHOPIFY_ACCESS_TOKEN", ""))
    p.add_argument("--api-version", default="2024-01")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "shopify_catalogo_variantes.xlsx",
        help="Ruta del .xlsx de salida",
    )
    p.add_argument(
        "--page-delay",
        type=float,
        default=0.25,
        help="Pausa en segundos entre páginas de productos (rate limit)",
    )
    args = p.parse_args()

    if not args.shop or not args.token:
        print("Faltan --shop / --token o variables de entorno.", file=sys.stderr)
        return 1

    try:
        rows = iter_product_variant_rows(args.shop, args.token, args.api_version, args.page_delay)
    except (OSError, RuntimeError, json.JSONDecodeError) as e:
        print(e, file=sys.stderr)
        return 1

    write_xlsx(args.output, HEADERS_ES, rows)
    print(f"Listo: {len(rows)} filas de variantes -> {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
