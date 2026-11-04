import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Architecture guardian: fails the build when the source breaks a closed pattern.
 * `any` is not checked here because ESLint's strict configuration already rejects it.
 */
const SOURCE_ROOT = import.meta.dirname;

interface SourceFile {
  readonly path: string;
  readonly content: string;
}

const productionFiles: readonly SourceFile[] = readdirSync(SOURCE_ROOT, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.startsWith(`testing${sep}`))
  .map((path) => ({
    path: relative(SOURCE_ROOT, join(SOURCE_ROOT, path)).split(sep).join('/'),
    content: readFileSync(join(SOURCE_ROOT, path), 'utf8'),
  }));

const importsOf = (file: SourceFile): string[] =>
  [...file.content.matchAll(/from '([^']+)'/g)].map((match) => String(match[1]));

const pathsMatching = (pattern: RegExp, predicate: (file: SourceFile) => boolean): string[] =>
  productionFiles.filter((file) => pattern.test(file.path) && predicate(file)).map((file) => file.path);

describe('architecture', () => {
  it('finds the files it guards, so that a wrong path cannot pass by scanning nothing', () => {
    const paths = productionFiles.map((file) => file.path);

    expect(paths).toContain('statistics/domain/statistics.ts');
    expect(paths).toContain('auth/domain/ports.ts');
    expect(paths).toContain('auth/application/login-service.ts');
  });

  it('keeps the domain free of frameworks and of the other layers', () => {
    const offenders = pathsMatching(/\/domain\//, (file) =>
      importsOf(file).some((source) => !source.startsWith('./')),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps the application layer away from frameworks and adapters', () => {
    const offenders = pathsMatching(/\/application\//, (file) =>
      importsOf(file).some((source) => !source.startsWith('../domain/')),
    );

    expect(offenders).toEqual([]);
  });

  it('uses the server local time instead of converting to UTC', () => {
    const offenders = pathsMatching(/./, (file) => /toISOString|getUTC|toUTCString/.test(file.content));

    expect(offenders).toEqual([]);
  });

  it('logs through the structured logger only', () => {
    const offenders = pathsMatching(/./, (file) => /console\.\w+\(/.test(file.content));

    expect(offenders).toEqual([]);
  });

  it('reads the environment only in the composition root', () => {
    const offenders = pathsMatching(/./, (file) => file.path !== 'server.ts' && file.content.includes('process.env'));

    expect(offenders).toEqual([]);
  });
});
