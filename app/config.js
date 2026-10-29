import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const business = Object.freeze({
  name: 'Moston Pharmacy',
  company: 'Moston Pharmacy Services Ltd',
  phone: '01270 758779',
  tel: '+441270758779',
  email: 'pharmacy.fma50@nhs.net',
  address: 'G4, Dragon’s Lane, Sandbach, CW11 3PA',
  domain: 'https://mostonpharmacy.co.uk',
  facebook: 'https://www.facebook.com/profile.php?id=61579751310589',
});
