/**
 * Design pre-flight: mechanical checks from the UI skills, run in CI via `npm run preflight`.
 * Fails on em/en dashes in visible strings, emojis, banned fonts, h-screen, scroll listeners,
 * pure black/white, and engine imports inside the web app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WEB = join(ROOT, 'apps/web/src');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(name) ? [p] : [];
  });

interface Rule {
  name: string;
  test: RegExp;
  files?: RegExp;
}

const RULES: Rule[] = [
  { name: 'em dash or en dash in UI text', test: /[—–]/ },
  { name: 'emoji in code or copy', test: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u },
  { name: 'banned font family', test: /['"](Inter|Roboto|Arial|Open Sans|Helvetica)['"]/ },
  { name: 'h-screen (use min-h-[100dvh])', test: /\bh-screen\b/ },
  { name: 'window scroll listener', test: /addEventListener\(\s*['"]scroll['"]/ },
  { name: 'pure black or white colour', test: /#(000000|ffffff|000|fff)\b/i, files: /\.css$/ },
  { name: 'engine import in web bundle', test: /@gambit\/engine/ },
  { name: 'key card type leaked into web', test: /\bKeyCard\b|\bGameState\b/ },
];

let failures = 0;
for (const file of walk(WEB)) {
  const text = readFileSync(file, 'utf8');
  for (const rule of RULES) {
    if (rule.files && !rule.files.test(file)) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (rule.test.test(line)) {
        failures += 1;
        console.error(`${relative(ROOT, file)}:${i + 1}  ${rule.name}\n    ${line.trim().slice(0, 120)}`);
      }
    });
  }
}

if (failures > 0) {
  console.error(`\nPre-flight failed with ${failures} finding${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('Pre-flight clean.');
