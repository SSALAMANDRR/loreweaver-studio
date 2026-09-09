"""Rebuild/check the vendored protocol without requiring an engine at app build time.

Refresh: python scripts/vendor_protocol.py --engine ../loreweaver
Offline integrity: python scripts/vendor_protocol.py --check
Cross-repo drift: python scripts/vendor_protocol.py --check --engine ../loreweaver
"""

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive_bytes(files):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            entry = tarfile.TarInfo("package/" + name)
            entry.size = len(data)
            entry.mode = 0o644
            entry.mtime = 0
            archive.addfile(entry, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", filename="", mtime=0) as output:
        output.write(stream.getvalue())
    return compressed.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest_path = ROOT / "vendor" / "protocol-manifest.json"
    package_path = ROOT / "package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    dependency = package["dependencies"]["@loreweaver/protocol"]
    assert dependency.startswith("file:vendor/"), "protocol must be a self-contained vendored archive"
    artifact = ROOT / dependency.removeprefix("file:")
    compiler_version = json.loads((ROOT / "node_modules/typescript/package.json").read_text(encoding="utf-8"))["version"]
    if args.check:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert artifact.name == manifest["archive"], "dependency and protocol manifest disagree"
        packed = artifact.read_bytes()
        assert digest(packed) == manifest["sha256"], "protocol archive digest changed; regenerate it"
        with tarfile.open(fileobj=io.BytesIO(packed), mode="r:gz") as archive:
            files = {entry.name.removeprefix("package/"): archive.extractfile(entry).read()
                     for entry in archive.getmembers() if entry.isfile()}
        assert {name: digest(data) for name, data in files.items()} == manifest["files"], "archive content drift"
        assert json.loads(files["package.json"])["version"] == manifest["version"], "archive version drift"
        assert compiler_version == manifest["typescript"], "compiler changed; regenerate protocol archive"
        installed = ROOT / "node_modules/@loreweaver/protocol"
        assert all((installed / name).read_bytes() == data for name, data in files.items()), "installed protocol differs from archive; reinstall dependencies"
    if args.engine:
        source = args.engine.resolve() / "clients/protocol"
        with tempfile.TemporaryDirectory(prefix="lw-protocol-") as temporary:
            out = Path(temporary) / "dist"
            subprocess.run(["bun", str(ROOT / "node_modules/typescript/bin/tsc"), "-p",
                            str(source / "tsconfig.build.json"), "--outDir", str(out)], check=True)
            files = {}
            for name in ["package.json", "README.md", "LICENSE"]:
                files[name] = (source / name).read_text(encoding="utf-8").replace("\r\n", "\n").encode()
            for directory, prefix in [(source / "src", "src"), (out, "dist")]:
                for path in sorted(directory.rglob("*")):
                    if path.is_file() and ".test." not in path.name:
                        files[prefix + "/" + path.relative_to(directory).as_posix()] = path.read_text(encoding="utf-8").replace("\r\n", "\n").encode()
            version = json.loads(files["package.json"])["version"]
            packed = archive_bytes(files)
            archive_name = f"loreweaver-protocol-{version}-{digest(packed)[:12]}.tgz"
            generated = {"version": version, "archive": archive_name, "typescript": compiler_version, "sha256": digest(packed),
                         "files": {name: digest(data) for name, data in sorted(files.items())}}
            if args.check:
                assert generated["files"] == manifest["files"], "vendored protocol is stale relative to engine source; regenerate it"
            else:
                artifact = ROOT / "vendor" / archive_name
                artifact.parent.mkdir(parents=True, exist_ok=True)
                artifact.write_bytes(packed)
                manifest_path.write_text(json.dumps(generated, indent=2) + "\n", encoding="utf-8")
                package["dependencies"]["@loreweaver/protocol"] = "file:vendor/" + archive_name
                package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    elif not args.check:
        parser.error("--engine is required to regenerate")
    print("protocol archive: OK")


if __name__ == "__main__":
    main()
