import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const network = process.env.MFCOIN_NETWORK || 'testnet';
const archiveName = `mfcoin-wallet-chrome${network === 'mainnet' ? '-mainnet' : ''}-${version}.zip`;
const archive = path.resolve(`dist/${archiveName}`);
mkdirSync('dist', { recursive: true });
rmSync(archive, { force: true });
const result = spawnSync('zip', ['-q', '-r', archive, '.'], { cwd: 'build', stdio: 'inherit' });
if (result.status !== 0) throw new Error(`ZIP packaging failed with status ${result.status}`);
const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${hash}  ${archiveName}\n`);
console.log(`${archive}\nSHA-256: ${hash}`);
