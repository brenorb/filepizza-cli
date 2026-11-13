import json
import subprocess
import tarfile
import tempfile
from pathlib import Path


root = Path.cwd()
with tempfile.TemporaryDirectory() as tmp:
    output = Path(tmp)
    marker = root / "dist/state-machine-stale.js"
    marker.parent.mkdir(exist_ok=True)
    with marker.open("x") as handle:
        handle.write("// This stale build file must not appear in the tarball.\n")
    try:
        result = subprocess.run(
            ["npm", "pack", "--json", "--pack-destination", tmp],
            check=True, capture_output=True, text=True,
        )
        archive = output / json.loads(result.stdout)[0]["filename"]
        with tarfile.open(archive) as package:
            names = package.getnames()
            assert "package/dist/state-machine-stale.js" not in names
            assert "package/dist/cli.js" in names
            manifest = json.load(package.extractfile("package/package.json"))
            assert manifest["bin"] == {"filepizza": "./dist/cli.js"}
    finally:
        marker.unlink(missing_ok=True)
print("Pack rebuilt the declared CLI and omitted stale generated files")
