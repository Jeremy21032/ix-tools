#!/usr/bin/env python3
"""
Exporta todas las órdenes de una tienda Shopify con las columnas del listado
del admin: orden, fecha, cliente, fulfil by, canal, total, payment status,
fulfillment status, items, delivery status, delivery method y tags.

Uso:
  py -3 shopify_export_orders.py --shop mi-tienda.myshopify.com --token shpat_xxx
  py -3 shopify_export_orders.py --shop mi-tienda --token shpat_xxx --query "created_at:>=2026-01-01"

Token: read_orders. Fulfil by y delivery method usan fulfillmentOrders.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

try:
    import http.client
except ImportError:  # pragma: no cover
    import httplib as http  # type: ignore

API_VERSION = "2025-07"

COLUMNS = [
    "Order",
    "Date",
    "Customer",
    "Fulfil by",
    "Channel",
    "Total",
    "Payment status",
    "Fulfillment status",
    "Items",
    "Delivery status",
    "Delivery method",
    "Tags",
]

STATUS_LABELS = {
    "PAID": "Paid",
    "PENDING": "Pending",
    "AUTHORIZED": "Authorized",
    "PARTIALLY_PAID": "Partially paid",
    "PARTIALLY_REFUNDED": "Partially refunded",
    "REFUNDED": "Refunded",
    "VOIDED": "Voided",
    "EXPIRED": "Expired",
    "UNFULFILLED": "Unfulfilled",
    "PARTIALLY_FULFILLED": "Partially fulfilled",
    "FULFILLED": "Fulfilled",
    "RESTOCKED": "Restocked",
    "PENDING_FULFILLMENT": "Pending fulfillment",
    "OPEN": "Open",
    "IN_PROGRESS": "In progress",
    "ON_HOLD": "On hold",
    "SCHEDULED": "Scheduled",
    "REQUEST_DECLINED": "Request declined",
    "IN_TRANSIT": "In transit",
    "OUT_FOR_DELIVERY": "Out for delivery",
    "DELIVERED": "Delivered",
    "ATTEMPTED_DELIVERY": "Attempted delivery",
    "READY_FOR_PICKUP": "Ready for pickup",
    "PICKED_UP": "Picked up",
    "LABEL_PRINTED": "Label printed",
    "LABEL_PURCHASED": "Label purchased",
    "LABEL_VOIDED": "Label voided",
    "CONFIRMED": "Confirmed",
    "SUBMITTED": "Submitted",
    "MARKED_AS_FULFILLED": "Marked as fulfilled",
    "NOT_DELIVERED": "Not delivered",
    "CANCELED": "Canceled",
    "DELAYED": "Delayed",
    "FAILURE": "Failure",
}

SOURCE_CHANNELS = {
    "web": "Online Store",
    "pos": "Point of Sale",
    "shopify_draft_order": "Draft Orders",
    "iphone": "iPhone",
    "android": "Android",
}

CURRENCY_SYMBOLS = {
    "GTQ": "Q",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "MXN": "$",
    "COP": "$",
    "CLP": "$",
    "PEN": "S/",
    "CRC": "₡",
    "ARS": "$",
    "BRL": "R$",
    "CAD": "$",
    "UYU": "$U",
    "HNL": "L",
    "NIO": "C$",
    "PAB": "B/.",
    "DOP": "RD$",
    "BOB": "Bs",
}

ORDERS_QUERY = """
query ExportOrders($cursor: String, $query: String) {
  orders(first: 25, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name
      createdAt
      displayFinancialStatus
      displayFulfillmentStatus
      sourceName
      tags
      currencyCode
      currentSubtotalLineItemsQuantity
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      customer { displayName }
      channelInformation {
        channelDefinition { channelName }
        app { title }
      }
      shippingLine { title }
      fulfillments { displayStatus }
      fulfillmentOrders(first: 10) {
        nodes {
          fulfillBy
          deliveryMethod { presentedName }
        }
      }
    }
  }
}
"""

SHOP_QUERY = """
query ShopTimezone {
  shop { ianaTimezone }
}
"""


def normalize_shop(shop: str) -> str:
    shop = (shop or "").strip()
    if "://" in shop:
        parsed = urlparse(shop)
        host = parsed.netloc or parsed.path
        return host.split("/")[0].strip()
    shop = shop.rstrip("/")
    if not shop.endswith(".myshopify.com") and "." not in shop:
        return f"{shop}.myshopify.com"
    return shop


def _is_throttled(payload: dict[str, Any]) -> bool:
    for err in payload.get("errors") or []:
        if not isinstance(err, dict):
            if "throttl" in str(err).lower():
                return True
            continue
        code = str((err.get("extensions") or {}).get("code") or "")
        msg = str(err.get("message") or "")
        if code.upper() == "THROTTLED" or "throttl" in msg.lower():
            return True
    return False


def post_graphql(
    conn: http.client.HTTPSConnection,
    token: str,
    query: str,
    variables: dict[str, Any],
) -> dict[str, Any]:
    path = f"/admin/api/{API_VERSION}/graphql.json"
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
        "Content-Length": str(len(body)),
        "Accept": "application/json",
    }
    last_err: Exception | None = None
    for attempt in range(8):
        try:
            conn.request("POST", path, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read().decode("utf-8")
            if resp.status == 429 or resp.status >= 500:
                time.sleep(min(2.0 * (attempt + 1), 20))
                continue
            if resp.status >= 400:
                raise RuntimeError(f"HTTP {resp.status}: {raw[:800]}")
            payload = json.loads(raw)
            if _is_throttled(payload):
                time.sleep(min(2.0 * (attempt + 1), 20))
                continue
            return payload
        except (TimeoutError, OSError) as exc:
            last_err = exc
            time.sleep(min(2.0 * (attempt + 1), 20))
    if last_err:
        raise RuntimeError(str(last_err))
    raise RuntimeError("Shopify no respondió después de varios reintentos")


def label_status(value: str | None) -> str:
    if not value:
        return ""
    key = str(value).strip()
    if key in STATUS_LABELS:
        return STATUS_LABELS[key]
    return key.replace("_", " ").capitalize()


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def format_dt(dt: datetime | None, tz: ZoneInfo | None) -> str:
    if not dt:
        return ""
    if tz:
        dt = dt.astimezone(tz)
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{dt.strftime('%b')} {dt.day} at {hour}:{dt.strftime('%M')} {dt.strftime('%p').lower()}"


def format_admin_date(value: str | None, tz: ZoneInfo | None) -> str:
    return format_dt(parse_dt(value), tz)


def format_total(order: dict[str, Any]) -> str:
    money = ((order.get("currentTotalPriceSet") or {}).get("shopMoney") or {})
    amount_raw = money.get("amount")
    currency = money.get("currencyCode") or order.get("currencyCode") or ""
    if amount_raw is None or amount_raw == "":
        return ""
    try:
        amount = float(amount_raw)
    except (TypeError, ValueError):
        return f"{currency} {amount_raw}".strip()
    formatted = f"{amount:,.2f}"
    symbol = CURRENCY_SYMBOLS.get(str(currency).upper())
    if symbol:
        return f"{symbol} {formatted}"
    if currency:
        return f"{currency} {formatted}"
    return formatted


def unique_join(values: list[str]) -> str:
    seen: list[str] = []
    for value in values:
        text = (value or "").strip()
        if text and text not in seen:
            seen.append(text)
    return ", ".join(seen)


def channel_name(order: dict[str, Any]) -> str:
    info = order.get("channelInformation") or {}
    definition = info.get("channelDefinition") or {}
    name = (definition.get("channelName") or "").strip()
    if name:
        return name
    app_title = ((info.get("app") or {}).get("title") or "").strip()
    if app_title:
        return app_title
    source = str(order.get("sourceName") or "").strip()
    return SOURCE_CHANNELS.get(source, source)


def flatten_order(order: dict[str, Any], tz: ZoneInfo | None) -> dict[str, str]:
    customer = order.get("customer") or {}
    fulfillment_orders = ((order.get("fulfillmentOrders") or {}).get("nodes") or [])
    fulfill_by_values = [parse_dt(node.get("fulfillBy")) for node in fulfillment_orders]
    fulfill_by_values = [dt for dt in fulfill_by_values if dt]
    fulfil_by = format_dt(min(fulfill_by_values), tz) if fulfill_by_values else ""

    shipping_title = ((order.get("shippingLine") or {}).get("title") or "").strip()
    presented_names = [
        ((node.get("deliveryMethod") or {}).get("presentedName") or "").strip()
        for node in fulfillment_orders
    ]
    delivery_method = shipping_title or unique_join(presented_names)

    delivery_statuses = [
        label_status((item or {}).get("displayStatus"))
        for item in (order.get("fulfillments") or [])
    ]
    qty = order.get("currentSubtotalLineItemsQuantity")
    try:
        qty_n = int(qty or 0)
    except (TypeError, ValueError):
        qty_n = 0
    items = f"{qty_n} item" if qty_n == 1 else f"{qty_n} items"
    tags = order.get("tags") or []
    if isinstance(tags, str):
        tags_text = tags
    else:
        tags_text = ", ".join(str(tag) for tag in tags if tag)

    return {
        "Order": order.get("name") or "",
        "Date": format_admin_date(order.get("createdAt"), tz),
        "Customer": customer.get("displayName") or "",
        "Fulfil by": fulfil_by,
        "Channel": channel_name(order),
        "Total": format_total(order),
        "Payment status": label_status(order.get("displayFinancialStatus")),
        "Fulfillment status": label_status(order.get("displayFulfillmentStatus")),
        "Items": items,
        "Delivery status": unique_join(delivery_statuses),
        "Delivery method": delivery_method,
        "Tags": tags_text,
    }


def shop_timezone(conn: http.client.HTTPSConnection, token: str) -> ZoneInfo | None:
    payload = post_graphql(conn, token, SHOP_QUERY, {})
    if payload.get("errors"):
        print("No se pudo leer la zona horaria de la tienda; las fechas salen en UTC.", flush=True)
        return None
    name = (((payload.get("data") or {}).get("shop") or {}).get("ianaTimezone") or "").strip()
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except Exception:
        print(f"Zona horaria no reconocida ({name}); las fechas salen en UTC.", flush=True)
        return None


def fetch_orders(
    shop: str,
    token: str,
    query: str | None,
) -> list[dict[str, str]]:
    host = normalize_shop(shop)
    conn = http.client.HTTPSConnection(host, timeout=120)
    rows: list[dict[str, str]] = []
    cursor: str | None = None
    page = 0
    try:
        tz = shop_timezone(conn, token)
        while True:
            page += 1
            payload = post_graphql(
                conn,
                token,
                ORDERS_QUERY,
                {"cursor": cursor, "query": query or None},
            )
            if payload.get("errors"):
                raise RuntimeError(json.dumps(payload["errors"], ensure_ascii=False)[:2000])
            data = (payload.get("data") or {}).get("orders") or {}
            nodes = data.get("nodes") or []
            for node in nodes:
                rows.append(flatten_order(node or {}, tz))
            print(f"Página {page}: {len(rows)} órdenes", flush=True)
            page_info = data.get("pageInfo") or {}
            if not page_info.get("hasNextPage") or not nodes:
                break
            cursor = page_info.get("endCursor")
            if not cursor:
                break
            time.sleep(0.35)
    finally:
        conn.close()
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in COLUMNS})


def write_xlsx(path: Path, rows: list[dict[str, str]]) -> None:
    try:
        from openpyxl import Workbook
        from openpyxl.utils import get_column_letter
    except ImportError as exc:
        raise SystemExit("Falta openpyxl. Instale con: py -3 -m pip install openpyxl") from exc

    wb = Workbook()
    ws = wb.active
    ws.title = "Orders"
    ws.append(COLUMNS)
    for row in rows:
        ws.append([row.get(column, "") for column in COLUMNS])
    ws.freeze_panes = "A2"
    last = max(1, len(rows) + 1)
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{last}"
    widths = (14, 24, 32, 24, 18, 16, 18, 20, 12, 22, 22, 24)
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(index)].width = width
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Exporta el listado de órdenes Shopify (estado, canal, total).")
    parser.add_argument("--shop", default=os.environ.get("SHOPIFY_SHOP") or os.environ.get("SHOPIFY_STORE", ""))
    parser.add_argument("--token", default=os.environ.get("SHOPIFY_ACCESS_TOKEN", ""))
    parser.add_argument("--query", default="", help="Filtro Shopify, ej. created_at:>=2026-01-01")
    parser.add_argument("-o", "--output", type=Path, default=Path("orders_export.csv"))
    parser.add_argument("--excel", "-x", type=Path, help="Excel (.xlsx)")
    args = parser.parse_args()

    if not args.shop or not args.token:
        print("Faltan --shop y --token (o SHOPIFY_SHOP / SHOPIFY_ACCESS_TOKEN).", file=sys.stderr)
        return 1

    try:
        rows = fetch_orders(args.shop, args.token, (args.query or "").strip() or None)
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(exc, file=sys.stderr)
        return 1

    print(f"TOTAL ÓRDENES: {len(rows)}", flush=True)
    write_csv(args.output, rows)
    print(f"Guardado CSV: {args.output.resolve()}", flush=True)
    if args.excel:
        write_xlsx(args.excel, rows)
        print(f"Guardado Excel: {args.excel.resolve()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
