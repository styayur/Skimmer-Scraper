import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'acceptance/v0.1.0.json';
const report = JSON.parse(readFileSync(file, 'utf8'));
const verificationPath = 'evidence/v0.1.0-live-pages-verification.json';
if (!report.evidence.some((entry) => entry.path === verificationPath)) {
  const bytes = readFileSync(verificationPath);
  report.evidence.push({
    path: verificationPath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
report.generatedAt = new Date().toISOString();
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
