import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Verify without ever printing key values.
const vars = existsSync('.dev.vars')
  ? parseEnv(readFileSync('.dev.vars', 'utf8'))
  : {};
const secrets = ['TYPESAFE_API_KEY', 'OPENROUTER_API_KEY']
  .map((k) => vars[k])
  .filter((v) => v && v.length > 8);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
function visit(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile()) files.push(file);
  }
}
visit('dist');
const offending = [...new Set(files)].filter((file) =>
  secrets.some((secret) => readFileSync(file).includes(Buffer.from(secret))),
);
if (offending.length) {
  console.error('Secret found in tracked/build files:', offending);
  process.exit(1);
}
console.log(
  `No local provider secrets found in ${files.length} tracked/build files.`,
);
