"""Copy pinned Grover demos and apply the documented display-copy edits.

Run: python grover-search/tools/snapshot-demos.py ../BohmianGrover2D
The source checkout is read only. No fetch, commit or push is performed.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve()
REVISIONS = {
    "ordinary": ("Ordinary-Grover", "425109c"),
    "wave-hadamard": ("MultiRegion", "6e209e6"),
    "free-box": ("MultiRegionFreeMixing", "2f2991a"),
    "spin": ("SPINMultiRegionFree", "f03b4f0"),
}
ORDINARY = {"index.html", "styles.css", "main.js", "ordinary-core.js",
            "histogram-renderer.js", "recording.js"}
WAVE = {"index.html", "styles.css", "main.js", "multiregion-core.js",
        "grover-geometry.js", "probability-flow.js", "flow-renderer.js", "recording.js"}

def git(*args):
    return subprocess.check_output(["git", "-C", str(SOURCE), *args])

manifest = {"repository": "https://github.com/anssiZander/BohmianGrover2D", "demos": {}}
copy_edits = json.loads((ROOT / 'demos/copy-edits.json').read_text(encoding='utf-8'))
for name, (branch, revision) in REVISIONS.items():
    commit = git("rev-parse", revision).decode().strip()
    dest = ROOT / "demos" / name
    paths = git("ls-tree", "-r", "--name-only", commit).decode().splitlines()
    hashes = {}
    for path in paths:
        relative = path.removeprefix("BohmianGrover2D/")
        include = relative in (ORDINARY if name == "ordinary" else WAVE)
        include |= name != "ordinary" and relative.startswith(("shaders/", "assets/"))
        include |= path == "LICENSE"
        if not include:
            continue
        data = git("show", f"{commit}:{path}")
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        hashes[relative] = hashlib.sha256(data).hexdigest()
        edits = copy_edits.get(f'{name}/{relative}', {})
        for before, after in edits.items():
            if before.encode() not in data:
                raise ValueError(f'{name}/{relative}: missing expected copy: {before}')
            data = data.replace(before.encode(), after.encode())
        target.write_bytes(data)
    manifest["demos"][name] = {"branch": branch, "commit": commit, "sha256": hashes}
    print(f"{name}: {len(hashes)} files from {commit[:7]}, with documented display-copy edits")
(ROOT / "demos" / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
