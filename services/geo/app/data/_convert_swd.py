"""
One-off prep: convert the OpenCity primary storm-water-drain (rajakaluve) KML
into a compact GeoJSON bundled with the geo service.

Source (Public Domain, KSRSAC via OpenCity):
  https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps
  Primary SWD KML:
  https://data.opencity.in/dataset/fc97e05c-c54b-44e9-8d98-7663ee887922/resource/114758e9-c356-46e0-afdb-e1d52f972863/download/03eea514-d4bf-4cd9-8c7b-f904b1ea83f2.kml

Regenerate:
  curl -L -o swd_primary.kml "<url above>"
  python _convert_swd.py
"""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://www.opengis.net/kml/2.2}"
HERE = Path(__file__).parent


def convert(kml_name: str, out_name: str) -> None:
    root = ET.parse(HERE / kml_name).getroot()
    features = []
    for ls in root.iter(f"{NS}LineString"):
        coord_el = ls.find(f"{NS}coordinates")
        if coord_el is None or not coord_el.text:
            continue
        pts = []
        for tok in coord_el.text.split():
            parts = tok.split(",")
            if len(parts) >= 2:
                pts.append([round(float(parts[0]), 6), round(float(parts[1]), 6)])
        if len(pts) >= 2:
            features.append({"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": pts}})
    fc = {"type": "FeatureCollection", "features": features}
    (HERE / out_name).write_text(json.dumps(fc, separators=(",", ":")))
    print(f"{out_name}: {len(features)} lines")


if __name__ == "__main__":
    convert("swd_primary.kml", "rajakaluve_primary.geojson")
