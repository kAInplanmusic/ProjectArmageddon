"""Stufe 1 (Verbesserung): Seitenansichten per Bild-zu-Bild mit Porträt als Referenz.

Aufruf:  python3 scripts/seitenansichten/kontext.py SCHLUESSEL [SCHLUESSEL ...] [--versuch N] [--stark]

Modell black-forest-labs/FLUX.1-kontext-pro (Parameter `image_url`, ca. 0,04 USD
je Aufruf). Referenz ist ausschließlich das eigene Spielfigur-Porträt
`src/client/assets/characters/<fraktion>/NN_name.png` (auf Weiß gelegt, 512 px),
sonst wird nichts hochgeladen. Hintergrundfarbe wie im Text-zu-Bild-Verfahren
(`prompts.hintergrund`). Rohbilder landen unter $PA_SEITE_ARBEIT/roh/kontext/
(`<fraktion>__<NN_name>.png__vN.png`), jeder Aufruf im selben `kosten.jsonl`
wie bei `erzeugen.py`. Harte Obergrenze für diese Stufe: 1,8 USD
(`OBERGRENZE_STUFE_USD`) und 5,2 USD insgesamt. Der Schlüssel kommt nur aus
der Umgebung (`TOGETHER_API_KEY`) und wird nie ausgegeben.
"""
import base64, io, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from prompts import hintergrund

if "TOGETHER_API_KEY" not in os.environ and os.environ.get("PA_TOGETHER_ENV"):
    for zeile in Path(os.environ["PA_TOGETHER_ENV"]).read_text().splitlines():
        if zeile.startswith("TOGETHER_API_KEY="):
            os.environ["TOGETHER_API_KEY"] = zeile.split("=", 1)[1].strip().strip("\"'")

WURZEL = Path(__file__).resolve().parents[2]
PORTRAET = WURZEL / "src/client/assets/characters"
ARBEIT = Path(os.environ.get("PA_SEITE_ARBEIT", "arbeit-seitenansichten"))
MODELL = "black-forest-labs/FLUX.1-kontext-pro"
PREIS = 0.04
OBERGRENZE_STUFE_USD = 1.8
OBERGRENZE_GESAMT_USD = 5.2  # 3,41 USD Vorstufen + 1,8 USD diese Stufe
STUFE = "kontext"


def prompt(schluessel: str, stark: bool = False) -> str:
    name, hexa = hintergrund(schluessel)
    if stark:  # Wiederholung, wenn die Grundfassung Frontal-/Dreiviertelansicht liefert
        return (
            "same character, same colors, outfit, weapon and details, full body, rotate the character 90 degrees: "
            "pure side view, true profile, the whole body and the head turned to the right in profile, "
            "seen exactly from the side so that only one side of the body is visible, facing right, standing pose, "
            f"solid flat {name} ({hexa}) background, same illustration style, no text, no shadow"
        )
    return (
        "same character, same colors, outfit, weapon and details, full body, strict side view in profile "
        f"facing right, standing pose, solid flat {name} ({hexa}) background, same illustration style, "
        "no text, no shadow"
    )


def referenz(schluessel: str) -> str:
    """Porträt auf weißen Grund, 512 px, als Data-URL."""
    p = Image.open(PORTRAET / schluessel).convert("RGBA").resize((512, 512), Image.LANCZOS)
    flaeche = Image.new("RGB", p.size, (255, 255, 255))
    flaeche.paste(p, (0, 0), p)
    puffer = io.BytesIO()
    flaeche.save(puffer, "PNG")
    return "data:image/png;base64," + base64.b64encode(puffer.getvalue()).decode()


def kosten() -> tuple[float, float]:
    log = ARBEIT / "kosten.jsonl"
    gesamt = stufe = 0.0
    for z in log.read_text().splitlines() if log.exists() else []:
        if z.strip():
            e = json.loads(z)
            gesamt += e["usd"]
            if e.get("stufe") == STUFE:
                stufe += e["usd"]
    return gesamt, stufe


def buchen(schluessel: str, v: int, extra: dict) -> None:
    with open(ARBEIT / "kosten.jsonl", "a") as f:
        f.write(json.dumps({"modell": MODELL, "k": schluessel, "v": v, "usd": PREIS, "stufe": STUFE,
                            "t": time.time(), **extra}) + "\n")


def aufruf(schluessel: str, v: int, stark: bool = False) -> Path | None:
    ziel = ARBEIT / "roh" / "kontext" / (schluessel.replace("/", "__") + f"__v{v}.png")
    if ziel.exists():
        return ziel
    gesamt, stufe = kosten()
    if stufe + PREIS > OBERGRENZE_STUFE_USD or gesamt + PREIS > OBERGRENZE_GESAMT_USD:
        print("Kostenobergrenze erreicht, Abbruch", file=sys.stderr)
        return None
    ziel.parent.mkdir(parents=True, exist_ok=True)
    body = {"model": MODELL, "prompt": prompt(schluessel, stark), "image_url": referenz(schluessel),
            "seed": 20260715 + v, "n": 1, "response_format": "base64"}
    anfrage = urllib.request.Request(
        "https://api.together.xyz/v1/images/generations", data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["TOGETHER_API_KEY"],
                 "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 curl/8",
                 "Accept": "application/json"})
    try:  # genau ein Versuch je Aufruf: Wiederholungen entscheidet der Aufrufer (Budget)
        with urllib.request.urlopen(anfrage, timeout=240) as r:
            d = json.loads(r.read())
        buchen(schluessel, v, {})
        roh = d["data"][0]
        data = base64.b64decode(roh["b64_json"]) if roh.get("b64_json") else urllib.request.urlopen(roh["url"]).read()
        ziel.write_bytes(data)
        return ziel
    except urllib.error.HTTPError as e:
        print(f"{schluessel}: HTTP {e.code} {e.read().decode()[:300]}", file=sys.stderr)
        return None
    except Exception as e:  # Timeout o.ä.: konservativ als abgerechnet zählen
        buchen(schluessel, v, {"fehler": type(e).__name__})
        print(f"{schluessel}: {type(e).__name__}", file=sys.stderr)
        return None


def main() -> int:
    args = sys.argv[1:]
    v = 1
    if "--versuch" in args:
        i = args.index("--versuch"); v = int(args[i + 1]); del args[i:i + 2]
    stark = "--stark" in args
    args = [a for a in args if a != "--stark"]
    ARBEIT.mkdir(parents=True, exist_ok=True)
    for s in args:
        print(s, "OK" if aufruf(s, v, stark) else "FEHLT", flush=True)
    g, st = kosten()
    print(f"Kosten gesamt (konservativ): {g:.3f} USD, diese Stufe: {st:.3f} USD")
    return 0


if __name__ == "__main__":
    sys.exit(main())
