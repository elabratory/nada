/**
 * Exports the demo centre in the digital-twin JSON format and validates it.
 * Usage: npm run export:centre  →  public/centres/harbour-central.demo.json
 */
import { writeFileSync } from 'node:fs';
import { demoSnapshot, validateSnapshot } from '../src/platform/sources';

const snap = demoSnapshot();
const errors = validateSnapshot(snap);
if (errors.length) {
  console.error(`Invalid snapshot:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
writeFileSync('public/centres/harbour-central.demo.json', JSON.stringify(snap, null, 2));
console.log(`Exported ${snap.stores.length} stores, ${snap.stores.reduce((n, s) => n + s.products.length, 0)} products, ${snap.events.length} events. Valid.`);
