import path from 'node:path';
import { readDatabase } from '../../src/generations.js';
import type { Database } from '../../src/types.js';

export function fixturePath(name: string): string {
  return path.resolve('tests', 'fixtures', name);
}

export function readFixture(name: string): Database {
  return readDatabase(fixturePath(name));
}
