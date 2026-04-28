import { createHash } from 'node:crypto';

const password = process.argv.slice(2).join(' ');

if (!password) {
  console.error('Usage: npm run hash:password -- <password>');
  process.exit(1);
}

const hash = createHash('sha256').update(password, 'utf8').digest('hex');
console.log(hash);