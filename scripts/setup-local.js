import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { root } from '../app/config.js';
const file = join(root, '.dev.vars');
const previous = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
const secret = () => randomBytes(32).toString('base64url');
const values = {
  APP_MODE: 'demo',
  MAIL_MODE: 'preview',
  SITE_ORIGIN: 'http://127.0.0.1:4173',
  PREVIEW_ENABLED: 'true',
  PREVIEW_PASSWORD: secret(),
  SESSION_SECRET: secret(),
  LOCAL_EDITOR: 'true',
  LOCAL_STAFF_PASSWORD: secret(),
  TEST_EMAIL: 'matthew.years18@gmail.com',
  ...previous,
};
writeFileSync(
  file,
  Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(
  join(root, 'data/preview-access.txt'),
  `PRIVATE STATIC WEBSITE PREVIEW\nhttp://127.0.0.1:4173/\nViewing password: ${values.PREVIEW_PASSWORD}\nShare privately. This does not grant staff editing access.\n`,
  { mode: 0o600 },
);
writeFileSync(
  join(root, 'data/demo-access.txt'),
  `LOCAL STAFF EDITOR\nhttp://127.0.0.1:4173/admin\nStaff password: ${values.LOCAL_STAFF_PASSWORD}\nLocal demonstration only. Hosted staff use their own approved GitHub accounts.\n`,
  { mode: 0o600 },
);
console.log(
  'Local static-preview settings prepared. Passwords are in data/preview-access.txt and data/demo-access.txt. No MySQL or email service is required.',
);
