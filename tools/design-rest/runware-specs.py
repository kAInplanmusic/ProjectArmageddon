#!/usr/bin/env python3
"""Erzeugt Pack-Specs für Runware-Frames und packt nur freigegebene Figuren.

Aufruf:
  python3 tools/design-rest/runware-specs.py walk
  python3 tools/design-rest/runware-specs.py walk --approve xeno,machina
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHARACTERS = json.loads((ROOT / "tools/design-rest/characters.json").read_text())
NORMALIZED = ROOT / "artifacts/design-rest/runware-normalisiert"
SPECS = ROOT / "artifacts/design-rest/runware-specs"
SHEETS = ROOT / "artifacts/design-rest/runware-sheets"
FLAGS = ["identity", "anatomy", "palette", "pose", "anchors", "alpha", "temporal", "approved"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("animation", choices=["walk", "action"])
    parser.add_argument("--approve", default="", help="Kommagetrennte Fraktions- oder Figuren-IDs")
    args = parser.parse_args()
    approved = {value.strip() for value in args.approve.split(",") if value.strip()}
    for cid, character in sorted(CHARACTERS.items()):
        source = NORMALIZED / cid / args.animation
        if not source.exists():
            continue
        spec_dir = SPECS / cid / args.animation
        spec_dir.mkdir(parents=True, exist_ok=True)
        freigabe = cid in approved or character["faction"] in approved
        review = {}
        frames = []
        for frame in range(8):
            path = source / f"{args.animation}{frame}.png"
            if not path.exists():
                raise SystemExit(f"Fehlt: {path}")
            job_id = f"{cid}-{args.animation}-{frame}"
            review[job_id] = {
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "reviewer": "runware-auto-pipeline" if freigabe else None,
                **{flag: freigabe for flag in FLAGS},
            }
            frames.append({"file": f"../../../runware-normalisiert/{cid}/{args.animation}/{path.name}", "jobId": job_id})
        review_path = spec_dir / "review.json"
        review_path.write_text(json.dumps(review, indent=2) + "\n")
        spec = {
            "frames": frames,
            "review": "review.json",
            "sourceBaseline": 960,
        }
        spec_path = spec_dir / "spec.json"
        spec_path.write_text(json.dumps(spec, indent=2) + "\n")
        if freigabe:
            target = SHEETS / character["faction"] / (character["sprite"].replace(".png", "") + f"__{args.animation}.webp")
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                import subprocess
                subprocess.run(["python3", str(ROOT / "tools/design-rest/pack.py"), str(spec_path), str(target)], check=True)
                print(target.relative_to(ROOT))
        else:
            print(f"spec {cid} {args.animation} (nicht freigegeben)")


if __name__ == "__main__":
    main()
