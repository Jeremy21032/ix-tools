"""
Consulta ordenes por customer usando firma y exporta resultados a Excel.

Uso:
  Comando help (todas las opciones):
  py fetch_orders_to_excel.py --help

  Ejemplo con todas las opciones:
  py fetch_orders_to_excel.py \
    --orders-file facturar.txt \
    --customers-file customer_lookup.json \
    --output orders_report.xlsx \
    --output-dir reports \
    --signature-url-template "https://integration.ixcomerciolabs.com/api/iws-keys/{type}" \
    --signature-apim-key "$SIGNATURE_APIM_KEY" \
    --get-order-url "https://intcomex-prod.apigee.net/v1/getorder" \
    --get-order-locale es \
    --get-order-cookie "__uzma=...; __uzmb=...; __uzmc=...; __uzmd=...; __uzme=..." \
    --commerce IXC \
    --debug \
    --yes \
    --max-order-attempts 6

  Ejemplo mínimo:
  py fetch_orders_to_excel.py --orders-file facturar.txt --customers-file customer_lookup.json --output-dir reports

  Sin preguntas (todos los customers):
  py fetch_orders_to_excel.py ... --yes

  Si getOrder devuelve HTTP distinto de 200, se renueva signature hasta
  --max-order-attempts veces (tokens ~5 min).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_SIGNATURE_URL_TEMPLATE = os.environ.get(
    "SIGNATURE_URL_TEMPLATE",
    "https://integration.ixcomerciolabs.com/api/iws-keys/{type}",
)
# Env: SIGNATURE_APIM_KEY
DEFAULT_SIGNATURE_APIM_KEY = os.environ.get("SIGNATURE_APIM_KEY", "")
DEFAULT_GET_ORDER_URL = os.environ.get(
    "GET_ORDER_URL",
    "https://intcomex-prod.apigee.net/v1/getorder",
)
_SERVER_DATA = Path(__file__).resolve().parent.parent / "data" / "customer_lookup.json"


def debug_log(enabled: bool, message: str) -> None:
    if enabled:
        print(f"[{now_iso()}] [DEBUG] {message}")


def mask_sensitive_headers(headers: Dict[str, str]) -> Dict[str, str]:
    masked: Dict[str, str] = {}
    hidden_keys = {
        "ocp-apim-subscription-key",
        "x-api-key",
        "x-signature",
    }
    for key, value in headers.items():
        if key.lower() in hidden_keys and value:
            masked[key] = f"{str(value)[:6]}***"
        else:
            masked[key] = value
    return masked


@dataclass
class CustomerConfig:
    country: str
    customer_id: str
    type: str
    channel: str

    @classmethod
    def from_dict(cls, value: Dict[str, Any]) -> "CustomerConfig":
        required = ["country", "customerId", "type", "channel"]
        missing = [k for k in required if k not in value]
        if missing:
            raise ValueError(f"Faltan campos {missing} en customer config: {value}")
        return cls(
            country=str(value["country"]).strip(),
            customer_id=str(value["customerId"]).strip(),
            type=str(value["type"]).strip(),
            channel=str(value["channel"]).strip(),
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _build_request_headers(headers: Optional[Dict[str, str]], payload: Optional[Dict[str, Any]]) -> Dict[str, str]:
    req_headers = {
        "Accept": "*/*",
        "User-Agent": "PostmanRuntime/7.43.0",
        **dict(headers or {}),
    }
    if payload is not None:
        req_headers["Content-Type"] = "application/json"
    return req_headers


def http_json(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: int = 60,
) -> Dict[str, Any]:
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req_headers = _build_request_headers(headers, payload)
    req = Request(url=url, method=method.upper(), data=body, headers=req_headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            if not text:
                return {}
            return json.loads(text)
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} en {url}: {error_body}") from exc
    except URLError as exc:
        raise RuntimeError(f"Error de conexion en {url}: {exc}") from exc


def http_get_status_and_body(
    url: str,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 60,
) -> tuple[int, str]:
    """GET con codigo HTTP real (incluye 4xx/5xx sin lanzar)."""
    req_headers = _build_request_headers(headers, None)
    req = Request(url=url, method="GET", headers=req_headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return int(resp.status), text
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        return int(exc.code), text
    except URLError as exc:
        raise RuntimeError(f"Error de conexion en {url}: {exc}") from exc


def parse_json_body(text: str) -> Optional[Dict[str, Any]]:
    text = text.strip()
    if not text:
        return None
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def extract_customer_from_order_id(order_number: Optional[str]) -> Optional[str]:
    if not order_number:
        return None
    text = str(order_number).strip()
    if "_" not in text:
        return None
    return text.split("_")[-1].strip() or None


def resolve_customer(
    explicit_customer: Optional[str],
    order_number: Optional[str],
    customer_order_number: Optional[str],
    netsuite_order_number: Optional[str],
) -> Optional[str]:
    if explicit_customer and str(explicit_customer).strip():
        return str(explicit_customer).strip()
    for candidate in (order_number, customer_order_number, netsuite_order_number):
        resolved = extract_customer_from_order_id(candidate)
        if resolved:
            return resolved
    return None


def load_orders_from_json(path: str) -> List[Dict[str, Any]]:
    items = read_json(path)
    if not isinstance(items, list):
        raise ValueError("El archivo de ordenes JSON debe ser una lista.")

    normalized: List[Dict[str, Any]] = []
    for idx, row in enumerate(items, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"Fila {idx}: cada item debe ser objeto JSON.")
        order_number = row.get("orderNumber")
        customer_order_number = row.get("customerOrderNumber")
        netsuite_order_number = row.get("netsuiteOrderNumber")
        customer = resolve_customer(
            explicit_customer=row.get("customer"),
            order_number=order_number,
            customer_order_number=customer_order_number,
            netsuite_order_number=netsuite_order_number,
        )
        if not customer:
            raise ValueError(
                f"Fila {idx}: no se pudo resolver customer (usa campo 'customer' o sufijo '_CUSTOMER' en algun numero de orden)."
            )
        normalized.append(
            {
                "customer": customer,
                "orderNumber": order_number,
                "customerOrderNumber": customer_order_number,
                "netsuiteOrderNumber": netsuite_order_number,
            }
        )
    return normalized


def load_orders_from_txt(path: str) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        for idx, parts in enumerate(reader, start=1):
            values = [p.strip() for p in parts]
            if not values or not any(values):
                continue
            if len(values) < 3:
                raise ValueError(
                    f"Linea {idx}: se esperaban 3 columnas (orderNumber,customerOrderNumber,netsuiteOrderNumber)."
                )
            order_number, customer_order_number, netsuite_order_number = values[:3]
            customer = resolve_customer(
                explicit_customer=None,
                order_number=order_number,
                customer_order_number=customer_order_number,
                netsuite_order_number=netsuite_order_number,
            )
            if not customer:
                raise ValueError(
                    f"Linea {idx}: no se pudo resolver customer desde los numeros de orden."
                )
            normalized.append(
                {
                    "customer": customer,
                    "orderNumber": order_number or None,
                    "customerOrderNumber": customer_order_number or None,
                    "netsuiteOrderNumber": netsuite_order_number or None,
                }
            )
    return normalized


def load_orders(path: str) -> List[Dict[str, Any]]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".json":
        return load_orders_from_json(path)
    return load_orders_from_txt(path)


def build_signature_headers(
    cfg: CustomerConfig,
    commerce: str,
    apim_key: str,
) -> Dict[str, str]:
    return {
        "x-channel": cfg.channel,
        "X-customerId": cfg.customer_id,
        "X-country": cfg.country,
        "Ocp-Apim-Subscription-Key": apim_key,
        "x-api-version": "1",
        "x-commerce": commerce,
    }


def get_signature(
    cfg: CustomerConfig,
    signature_url_template: str,
    signature_apim_key: str,
    commerce: str,
    debug: bool = False,
) -> Dict[str, str]:
    url = signature_url_template.format(type=cfg.type)
    headers = build_signature_headers(cfg, commerce=commerce, apim_key=signature_apim_key)
    debug_log(debug, f"signature URL: {url}")
    debug_log(debug, f"signature headers: {json.dumps(mask_sensitive_headers(headers), ensure_ascii=False)}")
    response = http_json(
        url=url,
        method="GET",
        headers=headers,
    )
    debug_log(debug, f"signature response: {json.dumps(response, ensure_ascii=False)}")
    result = response.get("result") or {}
    signature = result.get("signature")
    timestamp = result.get("timestamp")
    api_key = result.get("apiKey")
    if not signature or not timestamp:
        raise RuntimeError(f"Respuesta de signature invalida para type={cfg.type}: {response}")
    return {"signature": str(signature), "timestamp": str(timestamp), "apiKey": str(api_key or "")}


def fetch_order_with_status(
    get_order_url: str,
    signature_data: Dict[str, str],
    order_number: str,
    get_order_locale: str,
    get_order_cookie: str,
    debug: bool = False,
) -> tuple[int, Optional[Dict[str, Any]], str]:
    """
    GET getOrder con query string. Devuelve (http_status, json_dict_o_None, body_text).
    """
    headers: Dict[str, str] = {}
    if get_order_cookie:
        headers["Cookie"] = get_order_cookie
    debug_log(debug, f"getOrder orderNumber: {order_number}")
    if headers:
        debug_log(debug, f"getOrder headers: {json.dumps(mask_sensitive_headers(headers), ensure_ascii=False)}")

    query_params = {
        "apiKey": signature_data.get("apiKey", ""),
        "utcTimeStamp": signature_data["timestamp"],
        "signature": signature_data["signature"],
        "OrderNumber": order_number,
    }
    if get_order_locale:
        query_params["locale"] = get_order_locale

    url = f"{get_order_url}?{urlencode(query_params)}"
    debug_log(debug, f"getOrder URL (GET): {url}")
    status, text = http_get_status_and_body(url=url, headers=headers)
    parsed = parse_json_body(text)
    debug_log(debug, f"getOrder HTTP {status}, body (trunc): {text[:500]}{'...' if len(text) > 500 else ''}")
    return status, parsed, text


def iter_order_numbers(order_row: Dict[str, Any]) -> Iterable[str]:
    # Requisito: consultar solo por orderNumber.
    val = order_row.get("orderNumber")
    if val is not None and str(val).strip():
        yield str(val).strip()


def build_output_path(output_dir: str, output_base_name: str) -> str:
    folder = Path(output_dir)
    folder.mkdir(parents=True, exist_ok=True)
    stem = Path(output_base_name).stem or "orders_report"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"{stem}_{timestamp}.xlsx"
    return str(folder / file_name)


def extract_status_fields(response: Dict[str, Any]) -> Dict[str, Any]:
    result = response.get("result")
    order = result if isinstance(result, dict) else response
    status = order.get("Status") if isinstance(order, dict) else {}
    return {
        "PickNumber": order.get("PickNumber"),
        "PickDate": order.get("PickDate"),
        "PackNumber": order.get("PackNumber"),
        "PackDate": order.get("PackDate"),
        "StatusCode": (status or {}).get("StatusCode"),
        "StatusDescription": (status or {}).get("Description"),
    }


def merge_get_order_outcome(
    status: int,
    parsed: Optional[Dict[str, Any]],
    raw_body: str,
) -> tuple[Dict[str, Any], str]:
    """Si HTTP 200 y JSON valido, devuelve campos extraidos y error vacio."""
    if status != 200:
        snippet = raw_body.strip().replace("\n", " ")[:400]
        return {}, f"HTTP {status}: {snippet}"
    if parsed is None:
        return {}, "HTTP 200 pero cuerpo no es JSON valido"
    return extract_status_fields(parsed), ""


def print_orders_summary_by_customer(
    grouped: Dict[str, List[Dict[str, Any]]],
    customer_lookup: Dict[str, CustomerConfig],
) -> None:
    print("\n--- Resumen: ordenes por customer ---")
    grand = 0
    for cust in sorted(grouped.keys()):
        n = len(grouped[cust])
        grand += n
        ok_lookup = cust in customer_lookup
        print(f"  {cust}: {n} orden(es)  [{'lookup OK' if ok_lookup else 'SIN entrada en customer_lookup.json'}]")
    print(f"--- Total ordenes en archivo: {grand} ---\n")


def confirm_customer_proceed(customer: str, count: int, auto_yes: bool) -> bool:
    if auto_yes:
        print(f"[{now_iso()}] Customer {customer}: {count} orden(es) — procediendo (--yes).")
        return True
    print(f"\n>>> Customer **{customer}** — {count} orden(es).")
    try:
        ans = input("¿Proceder con este customer? [s/N]: ").strip().lower()
    except EOFError:
        print("(EOF: se interpreta como No.)")
        return False
    return ans in ("s", "si", "sí", "y", "yes")


REPORT_COLUMNS = [
    "customer",
    "queryOrderNumber",
    "orderNumber",
    "customerOrderNumber",
    "netsuiteOrderNumber",
    "PickNumber",
    "PickDate",
    "PackNumber",
    "PackDate",
    "StatusCode",
    "StatusDescription",
    "error",
]


def export_excel(rows: List[Dict[str, Any]], output_path: str) -> None:
    try:
        from openpyxl import Workbook  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "No se encontro openpyxl. Instala con: pip install openpyxl"
        ) from exc

    wb = Workbook()
    ws = wb.active
    ws.title = "Orders"
    columns = REPORT_COLUMNS
    ws.append(columns)
    for row in rows:
        ws.append([row.get(col) for col in columns])
    wb.save(output_path)


def export_json(rows: List[Dict[str, Any]], output_path: str) -> None:
    payload = {
        "columns": REPORT_COLUMNS,
        "rows": [{col: row.get(col, "") for col in REPORT_COLUMNS} for row in rows],
    }
    Path(output_path).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Consulta getOrder por customer y exporta Excel.")
    parser.add_argument(
        "--orders-file",
        "--input",
        dest="orders_file",
        default="source_orders.json",
        help="Fuente de ordenes (.json o .txt/.csv).",
    )
    parser.add_argument(
        "--customers-file",
        default=str(_SERVER_DATA),
        help="Diccionario customer->config.",
    )
    parser.add_argument(
        "--output",
        default="orders_report.xlsx",
        help="Nombre base del XLSX (se agrega sufijo fecha/hora).",
    )
    parser.add_argument(
        "--output-dir",
        default="reports",
        help="Carpeta donde se guardará el Excel.",
    )
    parser.add_argument("--signature-url-template", default=DEFAULT_SIGNATURE_URL_TEMPLATE)
    parser.add_argument("--signature-apim-key", default=DEFAULT_SIGNATURE_APIM_KEY)
    parser.add_argument("--get-order-url", default=DEFAULT_GET_ORDER_URL)
    parser.add_argument("--get-order-locale", default="es", help="Valor de locale para getOrder.")
    parser.add_argument(
        "--get-order-cookie",
        default=os.environ.get("GET_ORDER_COOKIE", ""),
        help="Cookie completa para getOrder (env: GET_ORDER_COOKIE).",
    )
    parser.add_argument("--commerce", default="IXC")
    parser.add_argument("--debug", action="store_true", help="Activa trazas detalladas del flujo.")
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="No preguntar por customer; procesar todos.",
    )
    parser.add_argument(
        "--max-order-attempts",
        type=int,
        default=6,
        help="Intentos getOrder por orden; si HTTP != 200 se renueva signature entre intentos (default 6).",
    )
    parser.add_argument(
        "--json-out",
        default="",
        help="Si se indica, también escribe un JSON con columns+rows (para la UI).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    debug = bool(args.debug)
    print(f"[{now_iso()}] Cargando archivos...")
    debug_log(debug, f"orders file: {args.orders_file}")
    debug_log(debug, f"customers file: {args.customers_file}")
    final_output_path = build_output_path(args.output_dir, args.output)
    debug_log(debug, f"output dir: {args.output_dir}")
    debug_log(debug, f"output file final: {final_output_path}")

    customer_lookup_raw = read_json(args.customers_file)
    if not isinstance(customer_lookup_raw, dict):
        raise ValueError("customers-file debe ser un JSON objeto {customer: {config...}}.")
    customer_lookup = {
        key: CustomerConfig.from_dict(value) for key, value in customer_lookup_raw.items()
    }

    orders = load_orders(args.orders_file)
    debug_log(debug, f"total ordenes cargadas: {len(orders)}")
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in orders:
        grouped[row["customer"]].append(row)
    debug_log(debug, f"customers detectados: {', '.join(sorted(grouped.keys()))}")

    print_orders_summary_by_customer(grouped, customer_lookup)

    max_attempts = max(1, int(args.max_order_attempts))
    output_rows: List[Dict[str, Any]] = []
    for customer in sorted(grouped.keys()):
        customer_orders = grouped[customer]
        cfg = customer_lookup.get(customer)
        if not cfg:
            for row in customer_orders:
                output_rows.append(
                    {
                        **row,
                        "queryOrderNumber": "",
                        "error": f"Customer sin config: {customer}",
                    }
                )
            continue

        if not confirm_customer_proceed(customer, len(customer_orders), bool(args.yes)):
            for row in customer_orders:
                nums = list(dict.fromkeys(iter_order_numbers(row)))
                q = nums[0] if nums else ""
                output_rows.append(
                    {
                        **row,
                        "queryOrderNumber": q,
                        "error": "Omitido por usuario (no proceder)",
                    }
                )
            continue

        print(f"[{now_iso()}] Customer {customer}: obteniendo signature inicial (type={cfg.type})...")
        signature_data = get_signature(
            cfg=cfg,
            signature_url_template=args.signature_url_template,
            signature_apim_key=args.signature_apim_key,
            commerce=args.commerce,
            debug=debug,
        )

        for row in customer_orders:
            order_numbers = list(dict.fromkeys(iter_order_numbers(row)))
            if not order_numbers:
                output_rows.append(
                    {**row, "queryOrderNumber": "", "error": "Sin numeros de orden para consultar"}
                )
                continue

            for candidate in order_numbers:
                base = {**row, "queryOrderNumber": candidate}
                last_err = ""
                for attempt in range(max_attempts):
                    try:
                        status, parsed, raw = fetch_order_with_status(
                            get_order_url=args.get_order_url,
                            signature_data=signature_data,
                            order_number=candidate,
                            get_order_locale=args.get_order_locale,
                            get_order_cookie=args.get_order_cookie,
                            debug=debug,
                        )
                    except Exception as exc:  # pylint: disable=broad-except
                        last_err = str(exc)
                        if attempt + 1 < max_attempts:
                            print(
                                f"  [{customer}] {candidate}: error de red — renovando signature "
                                f"({attempt + 1}/{max_attempts})..."
                            )
                            signature_data = get_signature(
                                cfg=cfg,
                                signature_url_template=args.signature_url_template,
                                signature_apim_key=args.signature_apim_key,
                                commerce=args.commerce,
                                debug=debug,
                            )
                            continue
                        output_rows.append({**base, "error": last_err})
                        break

                    fields, err = merge_get_order_outcome(status, parsed, raw)
                    if not err:
                        output_rows.append({**base, **fields, "error": ""})
                        break

                    last_err = err
                    if status == 200:
                        output_rows.append({**base, **fields, "error": last_err})
                        break

                    if attempt + 1 < max_attempts:
                        print(
                            f"  [{customer}] {candidate}: {last_err[:120]} — renovando signature "
                            f"({attempt + 1}/{max_attempts})..."
                        )
                        signature_data = get_signature(
                            cfg=cfg,
                            signature_url_template=args.signature_url_template,
                            signature_apim_key=args.signature_apim_key,
                            commerce=args.commerce,
                            debug=debug,
                        )
                    else:
                        output_rows.append({**base, **fields, "error": last_err})

    export_excel(output_rows, final_output_path)
    print(f"[{now_iso()}] Reporte generado: {final_output_path} (filas: {len(output_rows)})")
    if args.json_out:
        json_path = Path(args.json_out)
        if not json_path.is_absolute():
            json_path = Path(args.output_dir) / json_path
        export_json(output_rows, str(json_path))
        print(f"[{now_iso()}] JSON UI: {json_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[{now_iso()}] Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
