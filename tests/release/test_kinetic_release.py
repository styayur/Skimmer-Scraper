"""Portable provenance and qualification gates with deliberately different site and native fixtures."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("assembly", SCRIPTS / "assemble-kinetic-release.py")
assembly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assembly)


class PortableIdentity(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.site = dict(version="0.11.0", sourceCommit="a" * 40, sourceUrl="https://example.test/revision",
                         sourceCommitTime="2026-11-28T00:00:00Z", dirty=False,
                         toolchain=dict(node="v24.22.3", platform="linux", architecture="x64"))
        self.native = {**self.site, "sourceCommitTime": "2026-11-28T08:00:00+08:00", "toolchain": {
            "node": "v26.7.0", "platform": "win32", "architecture": "x64"}}
        self.installed = self.root / "installed"
        (self.installed / "licenses").mkdir(parents=True)
        (self.installed / "licenses/desktop-notices.txt").write_text("Native notice", encoding="utf8")
        self.exe = self.installed / assembly.EXE
        self.exe.write_bytes(b"MZdistinct test client")
        self.smoke = {"runtime": {"app": self.native}, "executableSha256": assembly.digest(self.exe)}
        with ZipFile(self.root / "static.zip", "w") as web:
            web.writestr("build-info.json", json.dumps(self.site))
            for name in ("CREDITS.md", "LICENSE", "licenses/PROJECT-MIT-v0.2.0.txt"):
                web.writestr(name, "Web notice\n")

    def package(self, output="portable.zip"):
        assembly.write(self.root / "smoke.json", self.smoke)
        return subprocess.run([sys.executable, SCRIPTS / "package-windows-portable.py", self.installed,
            self.root / "static.zip", self.root / "smoke.json", self.root / output], capture_output=True, text=True)

    def test_linux_site_and_windows_app_keep_their_own_identity(self):
        self.assertEqual(self.package().returncode, 0)
        with ZipFile(self.root / "portable.zip") as portable:
            self.assertEqual(json.loads(portable.read("build-info.json")), self.native)
            self.assertEqual(portable.read(assembly.EXE), self.exe.read_bytes())
            self.assertEqual(portable.read("licenses/desktop-notices.txt"), b"Native notice")
        self.assertEqual(self.package("again.zip").returncode, 0)
        self.assertEqual(assembly.digest(self.root / "portable.zip"), assembly.digest(self.root / "again.zip"))

    def test_another_executable_from_the_same_source_is_rejected(self):
        self.exe.write_bytes(b"MZa different build of the same commit")
        self.assertIn("differs from the installed", self.package().stderr)
        self.assertFalse((self.root / "portable.zip").exists())

    def test_changed_source_or_dirty_native_is_rejected(self):
        for key, value in (("sourceCommit", "b" * 40), ("dirty", True), ("sourceCommitTime", "2026-11-29T00:00:00Z")):
            with self.subTest(key):
                self.smoke["runtime"]["app"] = {**self.native, key: value}
                self.assertNotEqual(self.package().returncode, 0)
                self.assertFalse((self.root / "portable.zip").exists())

    def test_lifecycle_cannot_substitute_a_second_installer_or_client(self):
        h = self.smoke["executableSha256"]
        nsis = hashlib.sha256(b"NSIS fixture").hexdigest()
        state = dict(version="0.11.0", sourceCommit=self.site["sourceCommit"], installer={
            "installerSha256": nsis, "installedExecutableSha256": h})
        installed = dict(source=state["sourceCommit"], exitCode=0, installerSha256=nsis, exeSha256=h)
        steps = [dict(step=n, install=installed.copy()) for n in ("original", "upgrade", "rollback", "reupgrade")]
        receipt = {"from": "0.8.2", "target": "0.11.0", "passed": True, "stages": steps}
        self.assertEqual(assembly.check_lifecycle(receipt, state), "0.8.2")
        for field in ("exeSha256", "installerSha256"):
            with self.subTest(field):
                steps[-1]["install"] = {**installed, field: "f" * 64}
                with self.assertRaisesRegex(ValueError, "different installer or executable"):
                    assembly.check_lifecycle(receipt, state)

    def test_external_evidence_must_be_listed_hashed_and_inside_its_directory(self):
        index = self.root / "index.json"
        sha = self.site["sourceCommit"]
        state = {"sourceCommit": sha, "stage": "rehearsal"}
        files = []
        for role in ("raw", "failed"):
            p = self.root / (role + ".json")
            assembly.write(p, {"outcome": role})
            files.append(dict(role=role, path=p.name, sourceCommit=sha, sha256=assembly.digest(p)))
        assembly.write(index, dict(sourceCommit=sha, files=files))
        self.assertEqual(set(assembly.evidence_files(index, state, None, None)), {"raw.json", "failed.json"})
        for field, value in (("path", "../outside.json"), ("sha256", "a" * 64), ("role", "raw")):
            with self.subTest(field):
                assembly.write(index, dict(sourceCommit=sha, files=[files[0], {**files[1], field: value}]))
                with self.assertRaises(ValueError):
                    assembly.evidence_files(index, state, None, None)

    def test_public_site_proof_cannot_report_different_executable_bytes_for_the_same_source(self):
        static = self.root / "static.zip"
        sha = self.site["sourceCommit"]
        with ZipFile(static, "a") as web:
            web.writestr("assets/entry.js", b"measured code")
        with ZipFile(static) as web:
            files = {n: hashlib.sha256(web.read(n)).hexdigest() for n in web.namelist()}
        proof = dict(build=self.site, workflow=dict(headSha=sha, headBranch="main", event="workflow_dispatch",
                     conclusion="success"), files=files, servedFiles={n: {"sha256": h} for n, h in files.items()})
        index = self.root / "index.json"
        rows = []
        for role in ("raw", "failed", "public-web"):
            p = self.root / (role + ".json")
            assembly.write(p, proof if role == "public-web" else {"outcome": role})
            rows.append(dict(role=role, sha256=assembly.digest(p), path=p.name, sourceCommit=sha))
        assembly.write(index, dict(sourceCommit=sha, files=rows))
        state = {"stage": "rehearsal", "sourceCommit": sha, "site": {"build": self.site}}
        assembly.evidence_files(index, state, None, static)
        proof["servedFiles"]["assets/entry.js"]["sha256"] = "f" * 64
        assembly.write(p, proof)
        rows[-1]["sha256"] = assembly.digest(p)
        assembly.write(index, dict(sourceCommit=sha, files=rows))
        with self.assertRaisesRegex(ValueError, "Public response bytes differ"):
            assembly.evidence_files(index, state, None, static)
