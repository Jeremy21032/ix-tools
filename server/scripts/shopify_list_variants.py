#!/usr/bin/env python3
"""
Lista todas las variantes de productos vía Shopify Admin GraphQL (paginado).
Equivalente al script con node-fetch; usa una sola conexión HTTPS reutilizada
entre páginas para reducir latencia.

Variables de entorno (opcional):
  SHOPIFY_SHOP            ej. tu-store.myshopify.com
  SHOPIFY_ACCESS_TOKEN    token Admin API

Uso:
  py -3 shopify_list_variants.py --shop tu-store.myshopify.com --token shpat_xxx
  py -3 shopify_list_variants.py -o variants.json
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

QUERY = """
query getProductsWithVariants($cursor: String) {
  products(first: 50, after: $cursor) {
    edges {
      cursor
      node {
        id
        title
        variants(first: 50) {
          edges {
            node {
              id
              sku
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
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


def get_all_product_variants(shop: str, token: str, api_version: str) -> list[dict[str, Any]]:
    host = normalize_shop(shop)
    results: list[dict[str, Any]] = []
    cursor: str | None = None
    has_next = True

    conn = http.client.HTTPSConnection(host, timeout=120)
    try:
        while has_next:
            payload = post_graphql(conn, api_version, token, QUERY, {"cursor": cursor})

            if payload.get("errors"):
                raise RuntimeError(json.dumps(payload["errors"], indent=2))

            data = payload.get("data") or {}
            products = data.get("products") or {}
            edges = products.get("edges") or []

            for edge in edges:
                product = edge.get("node") or {}
                product_id = product.get("id")
                variant_edges = (product.get("variants") or {}).get("edges") or []
                for ve in variant_edges:
                    node = ve.get("node") or {}
                    results.append(
                        {
                            "productId": product_id,
                            "variantId": node.get("id"),
                            "sku": node.get("sku"),
                        }
                    )

            page = products.get("pageInfo") or {}
            has_next = bool(page.get("hasNextPage"))
            cursor = edges[-1].get("cursor") if edges else None
            if has_next and not cursor:
                raise RuntimeError("pageInfo.hasNextPage es true pero no hay cursor en el último edge")
    finally:
        conn.close()

    return results


def main() -> int:
    p = argparse.ArgumentParser(description="Shopify Admin GraphQL: todas las variantes (sku).")
    p.add_argument(
        "--shop",
        default=os.environ.get("SHOPIFY_SHOP", ""),
        help="Dominio de la tienda (ej. tu-store.myshopify.com)",
    )
    p.add_argument(
        "--token",
        default=os.environ.get("SHOPIFY_ACCESS_TOKEN", ""),
        help="X-Shopify-Access-Token",
    )
    p.add_argument("--api-version", default="2024-01", help="Versión Admin API en la URL")
    p.add_argument("-o", "--output", type=Path, help="Guardar JSON completo en este archivo")
    args = p.parse_args()

    if not args.shop or not args.token:
        print(
            "Faltan credenciales: use --shop y --token o variables "
            "SHOPIFY_SHOP y SHOPIFY_ACCESS_TOKEN.",
            file=sys.stderr,
        )
        return 1

    try:
        data = get_all_product_variants(args.shop, args.token, args.api_version)
    except (OSError, RuntimeError, json.JSONDecodeError) as e:
        print(e, file=sys.stderr)
        return 1

    print("TOTAL VARIANTS:", len(data))
    print(json.dumps(data[:10], indent=2, ensure_ascii=False))

    if args.output:
        args.output.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Guardado:", args.output.resolve())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
