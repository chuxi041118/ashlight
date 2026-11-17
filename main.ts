// Ashlight — the entry program (Node 22, standard library only). It hands the
// game in: copies game/ and screenshots/ from beside this file to the output
// directory and writes dossier.json there with the vendored make.fun library.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate caps (reference/gate.json): text_max_bytes shapes the dossier text;
// the rest refuse an entry the scorer would refuse — more than 4 screenshots
// or one over 256 KiB, more than 993 files in game/ or 48 MiB of game files in
// all, or a path under game/ over 1000 bytes. game/ counts beside /output's
// own 1000-entry cap, its screenshots/ and dossier.json.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(out, { recursive: true });
copyTree(join(here, 'game'), join(out, 'game'));
copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
