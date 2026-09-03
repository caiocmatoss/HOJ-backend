import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const importer = require('../../scripts/import-fsq-os-places.cjs');

describe('FSQ importer dry-run', () => {
  it('parses and validates CSV without initializing Prisma', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fsq-import-'));
    const file = path.join(root, 'places.csv');
    fs.writeFileSync(file, [
      'fsq_place_id,name,latitude,longitude,fsq_category_labels',
      'fsq-1,Place,-23.5,-46.6,Restaurant',
    ].join(String.fromCharCode(10)));
    const script = path.resolve(__dirname, '../../scripts/import-fsq-os-places.cjs');
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [script, '--file', file, '--dry-run'], { cwd: path.resolve(__dirname, '../..'), env, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('PrismaClientInitializationError');
    const report = JSON.parse(result.stdout);
    expect(report.mode).toBe('dry-run');
    expect(report.recordsRead).toBe(1);
    expect(report.wouldProcess).toBe(1);
    expect(report.wrote).toBe(false);
  });
});
describe('FSQ category matching', () => {
  it('parses pipe-separated labels and matches hierarchical categories', () => {
    expect(importer.parseFsqCategoryLabels('A| B |')).toEqual(['A', 'B']);
    const accepted = [
      'Dining and Drinking > Restaurant',
      'Dining and Drinking > Restaurant > Pizzeria',
      'Dining and Drinking > Restaurant > Burger Joint',
      'Dining and Drinking > Bar',
      'Dining and Drinking > Bar > Sports Bar',
      'Arts and Entertainment > Night Club',
      'Arts and Entertainment > Performing Arts Venue > Concert Hall',
      'Arts and Entertainment > Performing Arts Venue > Music Venue',
      'Retail > Food and Beverage Retail|Dining and Drinking > Bar',
      'Travel and Transportation > Lodging > Resort|Dining and Drinking > Restaurant|Landmarks and Outdoors > Farm',
    ];
    for (const labels of accepted) expect(importer.normalizeCategory({ fsq_category_labels: labels })).toBeTruthy();
  });

  it('rejects unrelated categories and substring false positives', () => {
    for (const labels of [
      'Dining and Drinking > Bakery',
      'Business and Professional Services > Barber Shop',
      'Travel and Transportation > Fuel Station',
      'Retail > Office Supply Store',
      'Business and Professional Services > Office',
      'Retail > Convenience Store',
      '',
      undefined,
      null,
    ]) expect(importer.normalizeCategory({ fsq_category_labels: labels })).toBeNull();
  });

  it('maps multiple supported categories deterministically', () => {
    expect(importer.normalizeCategory({ fsq_category_labels: 'Dining and Drinking > Restaurant|Arts and Entertainment > Night Club' })).toBe('Balada');
    expect(importer.normalizeCategory({ fsq_category_labels: 'Dining and Drinking > Restaurant|Dining and Drinking > Bar' })).toBe('Bar');
  });
});