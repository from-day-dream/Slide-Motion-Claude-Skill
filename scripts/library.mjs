#!/usr/bin/env node
// Rebuild a video's image library after images were added to (or removed from) <motion-dir>/images/
// by hand. Keeps existing descriptions, tags and use; new files count as the user's own.
//
// Usage: node library.mjs <motion-dir>
import path from 'node:path';
import { parseArgs, fail } from './lib/workspace.mjs';
import { buildLibrary } from './lib/library.mjs';

const args = parseArgs();
const dir = args._[0] ? path.resolve(args._[0]) : fail('usage: library.mjs <motion-dir>');
const lib = await buildLibrary(dir);
console.log(`Image library: ${lib.length} image(s) (${lib.filter(e => e.kind === 'photo').length} photos) → ${path.join(dir, 'images', 'library.png')}`);
for (const e of lib) console.log(`  ${e.id}  ${e.width}×${e.height} ${e.kind.padEnd(7)} ${e.rights.padEnd(11)} ${e.file}${e.description ? `  - ${e.description}` : ''}`);
