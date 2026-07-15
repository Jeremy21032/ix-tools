#!/usr/bin/env python3
"""
Lee un JSON exportado de mensajes brokered (array de objetos con `body` como string JSON)
y extrae por cada mensaje: OrderNumber, PickNumber, PackNumber, CustomerId, fordNotification.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any


def extract_from_body_parsed(parsed: dict[str, Any]) -> dict[str, Any]:
    new_order = parsed.get("newOrder")
    if not isinstance(new_order, dict):
        return {
            "OrderNumber": None,
            "PickNumber": None,
            "PackNumber": None,
            "CustomerId": None,
            "fordNotification": None,
        }

    payload = new_order.get("Payload_Response_Order")
    if not isinstance(payload, dict):
        payload = {}

    customer = payload.get("Customer")
    customer_id = None
    if isinstance(customer, dict):
        customer_id = customer.get("CustomerId")

    return {
        "OrderNumber": payload.get("OrderNumber"),
        "PickNumber": payload.get("PickNumber"),
        "PackNumber": payload.get("PackNumber"),
        "CustomerId": customer_id,
        "fordNotification": new_order.get("fordNotification"),
    }


def extract_row(message: dict[str, Any], index: int) -> dict[str, Any]:
    row: dict[str, Any] = {
        "index": index,
        "messageId": message.get("messageId"),
        "sequenceNumber": message.get("sequenceNumber"),
        "OrderNumber": None,
        "PickNumber": None,
        "PackNumber": None,
        "CustomerId": None,
        "fordNotification": None,
        "parse_error": None,
    }

    body = message.get("body")
    if body is None:
        row["parse_error"] = "missing body"
        return row
    if not isinstance(body, str):
        row["parse_error"] = f"body is not str ({type(body).__name__})"
        return row

    try:
        inner = json.loads(body)
    except json.JSONDecodeError as e:
        row["parse_error"] = str(e)
        return row

    if not isinstance(inner, dict):
        row["parse_error"] = f"inner body is not object ({type(inner).__name__})"
        return row

    extracted = extract_from_body_parsed(inner)
    row.update(extracted)
    return row


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extrae campos del body JSON de mensajes brokered.")
    p.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Ruta al archivo JSON de mensajes brokered.",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Si se indica, escribe CSV a esta ruta",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    path: Path = args.input
    if not path.is_file():
        print(f"No existe el archivo: {path}", file=sys.stderr)
        return 1

    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("Se esperaba un array JSON en la raíz.", file=sys.stderr)
        return 1

    fieldnames = [
        "index",
        "messageId",
        "sequenceNumber",
        "OrderNumber",
        "PickNumber",
        "PackNumber",
        "CustomerId",
        "fordNotification",
        "parse_error",
    ]
    rows = [extract_row(msg, i) for i, msg in enumerate(data) if isinstance(msg, dict)]

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8-sig", newline="") as out:
            w = csv.DictWriter(out, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print(f"Escrito: {args.output} ({len(rows)} filas)")
    else:
        w = csv.DictWriter(sys.stdout, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    errors = sum(1 for r in rows if r.get("parse_error"))
    if errors:
        print(f"Aviso: {errors} mensajes con error de parseo o body ausente.", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
