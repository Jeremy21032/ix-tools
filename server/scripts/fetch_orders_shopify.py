#!/usr/bin/env python3
"""
Fetch de detalle completo de órdenes de Shopify a partir de una lista de
números de orden (ej. 4076).

Variables de entorno:
  SHOPIFY_STORE          ej. tu-store.myshopify.com
  SHOPIFY_ACCESS_TOKEN   token Admin API

Uso:
  python fetch_orders_shopify.py --input ordenes.txt
  python fetch_orders_shopify.py --input ordenes.txt --output-dir output
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

API_VERSION = "2025-07"


def graphql_request(store: str, token: str, query: str, variables: dict) -> dict:
    url = f"https://{store}/admin/api/{API_VERSION}/graphql.json"
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"HTTP {e.code} al llamar a Shopify: {body}", file=sys.stderr)
        raise

    data = json.loads(body)
    if "errors" in data and data["errors"]:
        print(f"GraphQL errors: {data['errors']}", file=sys.stderr)
    return data


RESOLVE_QUERY = """
query ResolveOrder($q: String!) {
  orders(first: 1, query: $q) {
    nodes {
      id
      name
    }
  }
}
"""


def resolve_order_gid(store: str, token: str, order_number: str) -> str | None:
    search_value = order_number if order_number.startswith("#") else f"#{order_number}"
    data = graphql_request(store, token, RESOLVE_QUERY, {"q": f"name:{search_value}"})
    nodes = (
        data.get("data", {})
        .get("orders", {})
        .get("nodes", [])
    )
    if not nodes:
        return None
    return nodes[0]["id"]


ORDER_DETAIL_QUERY = """
query GetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    createdAt
    note
    tags
    customAttributes { key value }
    localizedFields(first: 10) {
      nodes { countryCode key purpose value title }
    }
    shippingAddress {
      name address1 city province formattedArea phone provinceCode company
      zip countryCodeV2 firstName lastName latitude longitude
    }
    billingAddress {
      address1 city province company formattedArea phone provinceCode zip
      countryCodeV2 firstName lastName
    }
    fulfillmentOrders(first: 10) {
      nodes {
        deliveryMethod { methodType presentedName serviceCode sourceReference id }
        status
        assignedLocation {
          name
          location {
            id
            metafields(namespace: "IXC", first: 100) {
              nodes { key value type }
            }
            address { city provinceCode countryCode address1 phone zip }
          }
        }
      }
    }
    customer { firstName lastName }
    phone
    email
    discountCodes
    transactions {
      authorizationCode
      formattedGateway
      gateway
      status
      kind
      paymentId
      receiptJson
      paymentDetails {
        ... on CardPaymentDetails { wallet company name paymentMethodName avsResultCode }
        ... on LocalPaymentMethodsPaymentDetails { paymentDescriptor paymentMethodName }
        ... on ShopPayInstallmentsPaymentDetails { paymentMethodName }
        ... on BasePaymentDetails { paymentMethodName }
      }
      amountSet { shopMoney { amount } }
    }
    currencyCode
    currentTaxLines {
      rate ratePercentage title source channelLiable
      priceSet { shopMoney { amount } }
    }
    lineItems(first: 100) {
      nodes {
        quantity
        sku
        title
        product { id }
        variant {
          sku
          title
          compareAtPrice
          price
          metafields(namespace: "IXC", first: 20) {
            nodes { key value jsonValue }
          }
        }
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        taxLines { priceSet { shopMoney { amount currencyCode } } }
        totalDiscountSet { shopMoney { amount } }
        discountedUnitPriceSet { shopMoney { amount } }
        discountAllocations {
          allocatedAmountSet { shopMoney { amount } }
          discountApplication {
            targetSelection
            allocationMethod
            targetType
            ... on ManualDiscountApplication { title description }
            ... on DiscountCodeApplication { code }
            ... on ScriptDiscountApplication { title }
            ... on AutomaticDiscountApplication { title }
          }
        }
        discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
      }
    }
    subtotalPriceSet { shopMoney { amount } }
    shippingLine {
      carrierIdentifier shippingRateHandle code custom deliveryCategory
      title id source
      originalPriceSet { shopMoney { amount currencyCode } }
      discountedPriceSet { shopMoney { amount currencyCode } }
      currentDiscountedPriceSet { shopMoney { amount currencyCode } }
      discountAllocations {
        allocatedAmountSet { shopMoney { amount currencyCode } }
        discountApplication {
          targetSelection
          allocationMethod
          targetType
          ... on ManualDiscountApplication { title description }
          ... on DiscountCodeApplication { code }
          ... on ScriptDiscountApplication { title }
          ... on AutomaticDiscountApplication { title }
        }
      }
      taxLines { priceSet { shopMoney { amount } } ratePercentage }
    }
    totalDiscountsSet { shopMoney { amount } }
    discountApplications(first: 10) {
      nodes {
        targetSelection
        allocationMethod
        targetType
        ... on ManualDiscountApplication { title description }
        ... on DiscountCodeApplication { code }
        ... on ScriptDiscountApplication { title }
        ... on AutomaticDiscountApplication { title }
      }
    }
    totalTaxSet { shopMoney { amount } }
    totalPriceSet { shopMoney { amount } }
    taxLines { ratePercentage }
  }
}
"""


def fetch_order_detail(store: str, token: str, gid: str) -> dict:
    data = graphql_request(store, token, ORDER_DETAIL_QUERY, {"id": gid})
    return data.get("data", {}).get("order", {})


def read_order_numbers(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    parts = re.split(r"[,\n\r]+", raw)
    return [p.strip().lstrip("#") for p in parts if p.strip()]


def _join_tx_field(transactions: list, field: str) -> str:
    return "; ".join(str(t.get(field) or "") for t in transactions)


def _join_tx_nested(transactions: list, *keys: str) -> str:
    parts = []
    for t in transactions:
        value = t
        for key in keys:
            value = (value or {}).get(key)
        parts.append(str(value) if value is not None else "")
    return "; ".join(parts)


def _join_payment_details(transactions: list, field: str) -> str:
    return "; ".join(
        str((t.get("paymentDetails") or {}).get(field) or "") for t in transactions
    )


def flatten_transactions_for_csv(transactions: list) -> dict:
    if not transactions:
        return {
            "transactions_count": 0,
            "transactions_json": "[]",
            "transaction_authorizationCode": "",
            "transaction_formattedGateway": "",
            "transaction_gateway": "",
            "transaction_status": "",
            "transaction_kind": "",
            "transaction_paymentId": "",
            "transaction_receiptJson": "",
            "transaction_amount": "",
            "transaction_paymentMethodName": "",
            "transaction_card_company": "",
            "transaction_card_name": "",
            "transaction_card_wallet": "",
            "transaction_avsResultCode": "",
            "transaction_paymentDescriptor": "",
            "transaction_paymentDetails_json": "[]",
        }

    payment_details = [t.get("paymentDetails") for t in transactions]
    return {
        "transactions_count": len(transactions),
        "transactions_json": json.dumps(transactions, ensure_ascii=False),
        "transaction_authorizationCode": _join_tx_field(transactions, "authorizationCode"),
        "transaction_formattedGateway": _join_tx_field(transactions, "formattedGateway"),
        "transaction_gateway": _join_tx_field(transactions, "gateway"),
        "transaction_status": _join_tx_field(transactions, "status"),
        "transaction_kind": _join_tx_field(transactions, "kind"),
        "transaction_paymentId": _join_tx_field(transactions, "paymentId"),
        "transaction_receiptJson": _join_tx_field(transactions, "receiptJson"),
        "transaction_amount": _join_tx_nested(transactions, "amountSet", "shopMoney", "amount"),
        "transaction_paymentMethodName": _join_payment_details(transactions, "paymentMethodName"),
        "transaction_card_company": _join_payment_details(transactions, "company"),
        "transaction_card_name": _join_payment_details(transactions, "name"),
        "transaction_card_wallet": _join_payment_details(transactions, "wallet"),
        "transaction_avsResultCode": _join_payment_details(transactions, "avsResultCode"),
        "transaction_paymentDescriptor": _join_payment_details(transactions, "paymentDescriptor"),
        "transaction_paymentDetails_json": json.dumps(payment_details, ensure_ascii=False),
    }


def flatten_for_csv(order: dict) -> dict:
    if not order:
        return {}

    customer = order.get("customer") or {}
    shipping = order.get("shippingAddress") or {}
    billing = order.get("billingAddress") or {}
    shipping_line = order.get("shippingLine") or {}

    line_items = order.get("lineItems", {}).get("nodes", [])
    skus = "; ".join(li.get("sku") or "" for li in line_items)
    titles = "; ".join(li.get("title") or "" for li in line_items)
    quantities = "; ".join(str(li.get("quantity")) for li in line_items)

    transactions = order.get("transactions", [])

    fulfillment_orders = order.get("fulfillmentOrders", {}).get("nodes", [])
    fulfillment_status = "; ".join(fo.get("status") or "" for fo in fulfillment_orders)

    row = {
        "id": order.get("id"),
        "name": order.get("name"),
        "createdAt": order.get("createdAt"),
        "note": order.get("note"),
        "tags": order.get("tags"),
        "email": order.get("email"),
        "phone": order.get("phone"),
        "customer_firstName": customer.get("firstName"),
        "customer_lastName": customer.get("lastName"),
        "currencyCode": order.get("currencyCode"),
        "subtotalPrice": (order.get("subtotalPriceSet") or {}).get("shopMoney", {}).get("amount"),
        "totalTax": (order.get("totalTaxSet") or {}).get("shopMoney", {}).get("amount"),
        "totalDiscounts": (order.get("totalDiscountsSet") or {}).get("shopMoney", {}).get("amount"),
        "totalPrice": (order.get("totalPriceSet") or {}).get("shopMoney", {}).get("amount"),
        "discountCodes": "; ".join(order.get("discountCodes") or []),
        "shipping_name": shipping.get("name"),
        "shipping_address1": shipping.get("address1"),
        "shipping_city": shipping.get("city"),
        "shipping_province": shipping.get("province"),
        "shipping_zip": shipping.get("zip"),
        "shipping_country": shipping.get("countryCodeV2"),
        "shipping_phone": shipping.get("phone"),
        "billing_address1": billing.get("address1"),
        "billing_city": billing.get("city"),
        "billing_country": billing.get("countryCodeV2"),
        "shippingLine_title": shipping_line.get("title"),
        "shippingLine_code": shipping_line.get("code"),
        "shippingLine_custom": shipping_line.get("custom"),
        "shippingLine_deliveryCategory": shipping_line.get("deliveryCategory"),
        "shippingLine_originalPrice": shipping_line.get("originalPriceSet").get("shopMoney").get("amount"),
        "shippingLine_discountedPrice": shipping_line.get("discountedPriceSet").get("shopMoney").get("amount"),
        "shippingLine_currentDiscountedPrice": shipping_line.get("currentDiscountedPriceSet").get("shopMoney").get("amount"),
        "shippingLine_discountAllocations": shipping_line.get("discountAllocations"),
        "shippingLine_taxLines": shipping_line.get("taxLines"),
        "shippingLine_source": shipping_line.get("source"),
        "line_items_skus": skus,
        "line_items_titles": titles,
        "line_items_quantities": quantities,
        "fulfillment_status": fulfillment_status,
    }
    row.update(flatten_transactions_for_csv(transactions))
    return row


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch detalle de órdenes Shopify.")
    parser.add_argument(
        "--shop",
        default=os.environ.get("SHOPIFY_STORE") or os.environ.get("SHOPIFY_SHOP", ""),
        help="Dominio de la tienda (ej. mi-tienda.myshopify.com). También SHOPIFY_STORE.",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("SHOPIFY_ACCESS_TOKEN", ""),
        help="X-Shopify-Access-Token. También SHOPIFY_ACCESS_TOKEN.",
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Archivo con números de orden (uno por línea o separados por coma).",
    )
    parser.add_argument(
        "--output-dir",
        default="output",
        help="Carpeta donde guardar JSON y CSV de salida.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    store = (args.shop or "").strip()
    for prefix in ("https://", "http://"):
        if store.startswith(prefix):
            store = store[len(prefix) :]
    store = store.rstrip("/")
    token = (args.token or "").strip()
    if not store or not token:
        print(
            "ERROR: faltan --shop/--token (o SHOPIFY_STORE / SHOPIFY_ACCESS_TOKEN).",
            file=sys.stderr,
        )
        return 1

    order_numbers = read_order_numbers(args.input)
    if not order_numbers:
        print("No se encontraron números de orden en el archivo.", file=sys.stderr)
        return 1

    print(f"Se encontraron {len(order_numbers)} números de orden: {order_numbers}")

    os.makedirs(args.output_dir, exist_ok=True)

    all_orders = []
    csv_rows = []
    not_found = []

    for num in order_numbers:
        print(f"-> Resolviendo orden #{num} ...")
        try:
            gid = resolve_order_gid(store, token, num)
        except Exception as e:
            print(f"   ERROR resolviendo #{num}: {e}", file=sys.stderr)
            not_found.append(num)
            continue

        if not gid:
            print(f"   No se encontró ninguna orden con número #{num}")
            not_found.append(num)
            continue

        print(f"   GID encontrado: {gid}. Obteniendo detalle...")
        try:
            detail = fetch_order_detail(store, token, gid)
        except Exception as e:
            print(f"   ERROR obteniendo detalle de #{num}: {e}", file=sys.stderr)
            not_found.append(num)
            continue

        all_orders.append(detail)
        csv_rows.append(flatten_for_csv(detail))
        time.sleep(0.5)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    json_path = os.path.join(args.output_dir, f"orders_detalle_{timestamp}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_orders, f, ensure_ascii=False, indent=2)
    print(f"\nJSON guardado en {json_path} ({len(all_orders)} órdenes)")

    if csv_rows:
        csv_path = os.path.join(args.output_dir, f"orders_detalle_{timestamp}.csv")
        fieldnames = list(csv_rows[0].keys())
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)
        print(f"CSV guardado en {csv_path}")

    if not_found:
        print(f"\nNo se pudieron procesar estas órdenes: {not_found}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
