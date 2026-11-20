// Keep the desktop version identical in package.json, tauri.conf.json, Cargo.toml and Cargo.lock.
//   node scripts/release-version.mjs set 1.1.0     (npm run release:version 1.1.0)
//   node scripts/release-version.mjs check v1.1.0  (npm run release:check v1.1.0; CI runs it on every tag)
//   node scripts/release-version.mjs notes 1.3.0   (npm run -s release:notes 1.3.0: the tag message)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const VERSION = /^\d+\.\d+\.\d+$/;
const CRATE = 'sellx-pos';

const files = {
  packageJson: resolve(root, 'package.json'),
  tauriConf: resolve(root, 'src-tauri/tauri.conf.json'),
  cargoToml: resolve(root, 'src-tauri/Cargo.toml'),
  cargoLock: resolve(root, 'src-tauri/Cargo.lock'),
};

function read() {
  return {
    'package.json': JSON.parse(readFileSync(files.packageJson, 'utf8')).version,
    'tauri.conf.json': JSON.parse(readFileSync(files.tauriConf, 'utf8')).version,
    'Cargo.toml': /^\[package\][\s\S]*?^version = "([^"]+)"/m.exec(readFileSync(files.cargoToml, 'utf8'))?.[1],
    'Cargo.lock': new RegExp(`name = "${CRATE}"\\r?\\nversion = "([^"]+)"`).exec(readFileSync(files.cargoLock, 'utf8'))?.[1],
  };
}

function replaceOnce(path, pattern, replacement) {
  const before = readFileSync(path, 'utf8');
  if (!pattern.test(before)) throw new Error(`version field not found in ${path}`);
  writeFileSync(path, before.replace(pattern, replacement));
}

function write(version) {
  replaceOnce(files.packageJson, /("version":\s*)"[^"]+"/, `$1"${version}"`);
  replaceOnce(files.tauriConf, /("version":\s*)"[^"]+"/, `$1"${version}"`);
  replaceOnce(files.cargoToml, /(^\[package\][\s\S]*?^version = )"[^"]+"/m, `$1"${version}"`);
  replaceOnce(files.cargoLock, new RegExp(`(name = "${CRATE}"\\r?\\nversion = )"[^"]+"`), `$1"${version}"`);
}

const [command, arg] = process.argv.slice(2);

if (command === 'set') {
  if (!arg || !VERSION.test(arg)) {
    console.error('usage: npm run release:version <MAJOR.MINOR.PATCH>');
    process.exit(1);
  }
  write(arg);
  console.log(`desktop version set to ${arg}:`, read());
} else if (command === 'check') {
  const expected = arg?.replace(/^v/, '');
  const versions = read();
  const distinct = new Set(Object.values(versions));
  console.log(versions);
  if (distinct.size !== 1 || (expected && !distinct.has(expected))) {
    console.error(`::error::desktop versions disagree${expected ? ` with tag ${arg}` : ''}. Run: npm run release:version ${expected ?? '<version>'}`);
    process.exit(1);
  }
  // the in-app "what's new" and version history read src/changelog.json
  const version = [...distinct][0];
  const entry = JSON.parse(readFileSync(resolve(root, 'src/changelog.json'), 'utf8')).find((e) => e.version === version);
  if (!entry || !entry.items?.length) {
    console.error(`::error::src/changelog.json has no notes for ${version}. Add them before tagging.`);
    process.exit(1);
  }
} else if (command === 'notes') {
  // the tag message = the same notes users see in the app: git tag -a vX -F <(npm run -s release:notes X)
  const entry = JSON.parse(readFileSync(resolve(root, 'src/changelog.json'), 'utf8')).find((e) => e.version === arg);
  if (!entry) {
    console.error(`no notes for ${arg} in src/changelog.json`);
    process.exit(1);
  }
  console.log([`تحديث ${entry.version}`, ...entry.items.map((i) => `- ${i}`)].join('\n'));
} else {
  console.error('usage: release-version.mjs set <version> | check [tag] | notes <version>');
  process.exit(1);
}
