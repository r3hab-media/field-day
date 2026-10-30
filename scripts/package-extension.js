// Builds dist/extension/ and zips it as dist/field-day-<version>.zip, the upload for the Chrome Web Store
// and Edge Add-ons. Fails if the manifest would be rejected or doesn't match package.json.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { deflateRawSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./build-extension.js');
const dir = path.join(root, 'dist/extension');

const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const problems = [];
if (manifest.version !== pkg.version) problems.push(`manifest version ${manifest.version} != package.json version ${pkg.version}`);
if (manifest.name.length > 75) problems.push(`name is ${manifest.name.length} characters (max 75)`);
if (manifest.description.length > 132) problems.push(`description is ${manifest.description.length} characters (max 132)`);
if (problems.length) {
  console.error('Cannot package:\n- ' + problems.join('\n- '));
  process.exit(1);
}

const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
  .filter((d) => d.isFile())
  .map((d) => path.relative(dir, path.join(d.parentPath, d.name)).split(path.sep).join('/'))
  .sort();

// Minimal ZIP writer (deflate only), so packaging needs no dependencies.
const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = await readFile(path.join(dir, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name);
  const head = (sig, size) => {
    const b = Buffer.alloc(size);
    b.writeUInt32LE(sig, 0);
    return b;
  };
  const local = head(0x04034b50, 30);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0x2021, 12); // date 1/1/1996, a fixed value so rebuilds are identical
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = head(0x02014b50, 46);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  local.copy(central, 8, 6, 30);
  central.writeUInt32LE(offset, 42);
  locals.push(local, nameBuf, packed);
  centrals.push(central, nameBuf);
  offset += local.length + nameBuf.length + packed.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);

const zip = path.join(root, 'dist', `field-day-${manifest.version}.zip`);
await writeFile(zip, Buffer.concat([...locals, cd, end]));
console.log(`dist/field-day-${manifest.version}.zip: ${files.length} files, ${(offset / 1024).toFixed(0)} KB`);
