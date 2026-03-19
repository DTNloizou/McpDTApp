/**
 * Pre-build script: reads all .md files from ui/app/kb/ and generates defaults.ts
 *
 * Run automatically before build/deploy via npm scripts,
 * or manually: node scripts/generate-kb-defaults.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kbDir = join(__dirname, '..', 'ui', 'app', 'kb');
const outFile = join(kbDir, 'defaults.ts');

const mdFiles = readdirSync(kbDir).filter(f => f.endsWith('.md')).sort();

if (mdFiles.length === 0) {
  console.log('No .md files found in ui/app/kb/ — generating empty defaults.ts');
}

const lines = [
  '/**',
  ' * AUTO-GENERATED — do not edit manually.',
  ` * Generated from ${mdFiles.length} .md file(s) in ui/app/kb/`,
  ' * Run: node scripts/generate-kb-defaults.mjs',
  ' */',
  '',
];

// Generate named exports for each file
for (const file of mdFiles) {
  const content = readFileSync(join(kbDir, file), 'utf-8');
  // Create a valid JS identifier from the filename
  const varName = file
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^(\d)/, '_$1');

  // Escape backticks and ${} in the content
  const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  lines.push(`export const ${varName} = \`${escaped}\`;`);
  lines.push('');
}

// Generate the registry map
lines.push('/** All default KB documents keyed by filename */');
lines.push('export const DEFAULT_KB_DOCS: Record<string, string> = {');
for (const file of mdFiles) {
  const varName = file
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^(\d)/, '_$1');
  lines.push(`  '${file}': ${varName},`);
}
lines.push('};');
lines.push('');

writeFileSync(outFile, lines.join('\n'), 'utf-8');
console.log(`Generated ${outFile} with ${mdFiles.length} document(s): ${mdFiles.join(', ')}`);
