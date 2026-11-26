"""Build the original celadon passage gate shipped with Skimmer-Scraper."""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/world-modules/celadon-court.glb"
positions = [[], []]


def prism(polygon, near, far, material=0):
    front = [(x, y, near) for x, y in polygon]
    back = [(x, y, far) for x, y in polygon]
    out = positions[material]
    for index in range(1, len(polygon) - 1):
        out.extend((front[0], front[index], front[index + 1]))
        out.extend((back[0], back[index + 1], back[index]))
    for index in range(len(polygon)):
        next_index = (index + 1) % len(polygon)
        out.extend((front[index], back[index], back[next_index]))
        out.extend((front[index], back[next_index], front[next_index]))


for side in (-1, 1):
    shaft = [(7, 0), (12, 0), (10.6, 7), (10.4, 13), (7, 13)]
    if side < 0:
        shaft = [(-x, y) for x, y in reversed(shaft)]
    prism(shaft, -9, -19)
    for height in (2.0, 7.0, 11.5):
        seam = [(side * 7, height), (side * 11.4, height), (side * 11.4, height + 0.35), (side * 7, height + 0.35)]
        if side < 0:
            seam.reverse()
        prism(seam, -8.65, -9, 1)
        prism(seam, -19, -19.35, 1)

for step in range(14):
    angle0 = step * math.pi / 14
    angle1 = (step + 1) * math.pi / 14
    def circle(angle, rx, ry):
        return (round(rx * math.cos(angle), 6), round(13 + ry * math.sin(angle), 6))
    segment = [circle(angle0, 10.5, 10), circle(angle1, 10.5, 10),
               circle(angle1, 7, 7), circle(angle0, 7, 7)]
    prism(segment, -9, -19)
    if step % 2 == 0:
        trim = [circle(angle0 + 0.03, 10.0, 9.4), circle(angle1 - 0.03, 10.0, 9.4),
                circle(angle1 - 0.03, 9.6, 9), circle(angle0 + 0.03, 9.6, 9)]
        prism(trim, -8.6, -9, 1)
        prism(trim, -19, -19.4, 1)

binary = bytearray()
views = []
accessors = []
for mesh in positions:
    offset = len(binary)
    for xyz in mesh:
        binary.extend(struct.pack("<3f", *xyz))
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset, "target": 34962})
    axes = list(zip(*mesh))
    accessors.append({"bufferView": len(views) - 1, "componentType": 5126, "count": len(mesh),
                      "type": "VEC3", "min": [min(axis) for axis in axes], "max": [max(axis) for axis in axes]})
gltf = {
    "asset": {"version": "2.0", "generator": "Skimmer-Scraper original celadon gate"},
    "scene": 0, "scenes": [{"nodes": [0, 1, 2, 3]}],
    "nodes": [
        {"name": "Celadon stone", "mesh": 0, "extras": {"skimmerRole": "SURFACE"}},
        {"name": "Brass fascia", "mesh": 1, "extras": {"skimmerRole": "DECORATION"}},
        {"name": "Entry", "extras": {"skimmerSocket": "entry"}},
        {"name": "Exit", "translation": [0, 0, -28], "extras": {"skimmerSocket": "exit"}},
    ],
    "meshes": [{"primitives": [{"attributes": {"POSITION": index}, "material": index}]} for index in range(2)],
    "materials": [
        {"doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": [0.26, 0.47, 0.42, 1], "roughnessFactor": 0.8}},
        {"doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": [0.60, 0.34, 0.12, 1], "metallicFactor": 0.45}},
    ],
    "buffers": [{"byteLength": len(binary)}],
    "bufferViews": views,
    "accessors": accessors,
}
metadata = json.dumps(gltf, separators=(",", ":")).encode("ascii")
metadata += b" " * (-len(metadata) % 4)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(metadata) + len(binary))
                   + struct.pack("<I4s", len(metadata), b"JSON") + metadata
                   + struct.pack("<I4s", len(binary), b"BIN\x00") + binary)
