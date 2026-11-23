"""Assemble real matched camera captures into a release comparison sheet."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
labels = {
    "title":"Title city", "canyon":"Tower canyon", "bridges":"Bridge tiers", "floating-garden":"Island approach",
    "moving-station":"Moving station", "inverted":"Inverted city", "dusk":"Sakura dusk",
    "chase":"Chase view", "cockpit":"Cockpit view",
    "world-1":"Cobalt / folded towers", "world-2":"Jade / garden terraces", "world-3":"Wisteria / lantern courts",
    "world-4":"Amber / needle towers", "world-5":"Golden return / moon gates"
}
width, height = 560, 350
canvas = Image.new("RGB", (2*width, len(labels)*(height+28)+38), "#162226")
draw = ImageDraw.Draw(canvas)
font = ImageFont.load_default(size=17)
for col, (directory, version) in enumerate([("v060","v0.6.0"),("pr4","v0.7.0 candidate")]):
    draw.text((col*width+10,8), version, fill="#ffddb8", font=font)
    records = {item["label"]:item for item in json.loads((root/f"acceptance/v0.7/{directory}.json").read_text())["records"]}
    for row,(key,title) in enumerate(labels.items()):
        y = 38+row*(height+28)
        image = Image.open(root/f"evidence/v0.7/{directory}/{key}.jpg")
        canvas.paste(image.resize((width,height),Image.Resampling.LANCZOS),(col*width,y))
        draw.text((col*width+10,y+height+3),title,fill="#f3eee8",font=font)
        assert records[key]["gen"] == col+3
canvas.save(root/"evidence/v0.7/visual-comparison.jpg",quality=89,optimize=True)
