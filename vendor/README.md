The protocol dependency is a local archive, built from the engine's shared
`clients/protocol` source. Installing dependencies, building the frontend and
bundling Tauri do not require an engine checkout.

To refresh after a protocol change, run from Studio (Python 3 and the installed
Studio TypeScript compiler). The script reads the engine's package version and
updates Studio's dependency to an archive named by version and content hash:

```sh
python scripts/vendor_protocol.py --engine ../loreweaver
bun install --ignore-scripts
python scripts/vendor_protocol.py --check --engine ../loreweaver
```

The script compiles declarations and JavaScript, normalizes text line endings,
and writes sorted tar entries with fixed timestamps and permissions. The manifest
pins the compiler version, protocol version, archive SHA-256 and each file hash.
The standalone web CI checks archive integrity. The cross-repo roundtrip gate
rebuilds from engine sources and rejects any content drift, including stale dist.
No registry publication or Git mutation is part of this workflow.
