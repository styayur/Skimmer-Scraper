"""Bake a seamless 256-pixel tangent-space normal map from periodic rock strata."""
from math import sin, cos, sqrt, tau
from pathlib import Path
from PIL import Image

size = 256
def relief(x, y):
    u, v = tau*x/size, tau*y/size
    return 1.35*sin(5*v + 2*u + .8*cos(3*u)) + .36*sin(18*v - 4*u) + .18*cos(27*u + 23*v)

image = Image.new("RGB", (size, size))
pixels = image.load()
for y in range(size):
    for x in range(size):
        dx = 2*(relief(x-1, y) - relief(x+1, y))
        dy = 2*(relief(x, y-1) - relief(x, y+1))
        length = sqrt(dx*dx + dy*dy + 1)
        pixels[x, y] = tuple(round(127.5*(v/length+1)) for v in (dx, dy, 1))
image.save(Path(__file__).resolve().parents[2] / "public/realms/dragonspine/strata-normal.png")
