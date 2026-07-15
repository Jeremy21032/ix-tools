#!/usr/bin/env python3
"""Convierte jerarquía geográfica JSON a Excel."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd


def json_to_excel(json_data: dict, output_file: Path) -> None:
    rows = []

    country_id = json_data.get("countryId")

    for level1 in json_data.get("hierarchy", []):
        level1_name = level1.get("name")
        level1_id = level1.get("id")
        state_id = level1.get("stateId")

        for level2 in level1.get("children", []):
            level2_name = level2.get("name")
            level2_id = level2.get("id")
            area_code = level2.get("areaCode")

            for level3 in level2.get("children", []):
                rows.append(
                    {
                        "countryId": country_id,
                        "level1_id": level1_id,
                        "level1_name": level1_name,
                        "stateId": state_id,
                        "level2_id": level2_id,
                        "level2_name": level2_name,
                        "areaCode": area_code,
                        "level3_id": level3.get("id"),
                        "level3_name": level3.get("name"),
                        "postalCode": level3.get("postalCode"),
                    }
                )

    df = pd.DataFrame(rows)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(output_file, index=False)
    print(f"Excel generado: {output_file}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convierte jerarquía JSON a Excel.")
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Archivo JSON de entrada con jerarquía geográfica.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("hierarchy.xlsx"),
        help="Ruta del Excel de salida.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.is_file():
        print(f"No existe el archivo: {args.input}", file=sys.stderr)
        return 1

    with args.input.open("r", encoding="utf-8") as f:
        data = json.load(f)

    json_to_excel(data, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
