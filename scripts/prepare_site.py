from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_site"

if SITE.exists():
    shutil.rmtree(SITE)

SITE.mkdir(parents=True)
for name in ("index.html", "styles.css", "app.js"):
    shutil.copy2(ROOT / name, SITE / name)

shutil.copytree(ROOT / "data", SITE / "data")
(SITE / ".nojekyll").write_text("", encoding="utf-8")
print("Prepared RADIO ARCHIVE GitHub Pages artifact.")
