"""Offline negative controls for the archive-integrity gate."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import vendor_protocol as vendor


class ProtocolArchiveTests(unittest.TestCase):
    def test_archive_is_reproducible_independent_of_input_order(self):
        self.assertEqual(vendor.archive_bytes({"a": b"one", "b": b"two"}),
                         vendor.archive_bytes({"b": b"two", "a": b"one"}))

    def test_corrupt_archive_fails_without_an_engine_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "vendor").mkdir()
            compiler = root / "node_modules/typescript"
            compiler.mkdir(parents=True)
            (compiler / "package.json").write_text('{"version":"test"}')
            (root / "package.json").write_text(json.dumps({"dependencies": {"@loreweaver/protocol": "file:vendor/p.tgz"}}))
            (root / "vendor/p.tgz").write_bytes(b"corrupted")
            (root / "vendor/protocol-manifest.json").write_text('{"archive":"p.tgz","sha256":"expected"}')
            with patch.object(vendor, "ROOT", root), patch("sys.argv", ["vendor_protocol.py", "--check"]):
                with self.assertRaisesRegex(AssertionError, "digest changed"):
                    with contextlib.redirect_stdout(io.StringIO()):
                        vendor.main()


if __name__ == "__main__":
    unittest.main()
