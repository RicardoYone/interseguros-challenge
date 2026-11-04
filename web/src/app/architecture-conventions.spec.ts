/// <reference types="vite/client" />
/**
 * Architecture guardian: reads the production sources as text and fails the build when
 * someone reintroduces a pattern this project closed.
 */
import { describe, expect, it } from 'vitest';

const productionSources = import.meta.glob(
  ['/src/app/**/*.ts', '!/src/app/**/*.spec.ts', '!/src/app/**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const templates = import.meta.glob('/src/app/**/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** A rule mentioned in a comment is not a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const code = Object.fromEntries(
  Object.entries(productionSources).map(([path, source]) => [path, stripComments(source)]),
);

function offenders(
  files: Record<string, string>,
  test: (path: string, text: string) => boolean,
): string[] {
  return Object.entries(files)
    .filter(([path, text]) => test(path, text))
    .map(([path]) => path)
    .sort();
}

describe('frontend closed patterns', () => {
  it('finds the code it guards, so that a wrong path cannot pass by scanning nothing', () => {
    expect(Object.keys(code)).toContain('/src/app/core/auth/auth.service.ts');
    expect(Object.keys(code)).toContain('/src/app/features/auth/login-page/login-page.ts');
    expect(Object.keys(templates)).toContain('/src/app/features/auth/login-page/login-page.html');
  });

  describe('security', () => {
    it('never stores anything in browser storage, where a script could steal the token', () => {
      expect(offenders(code, (_, text) => /\b(localStorage|sessionStorage|document\.cookie)\b/.test(text))).toEqual([]);
    });

    it('sends every request through HttpClient, so that the interceptor sees it', () => {
      expect(offenders(code, (_, text) => /\b(fetch|XMLHttpRequest)\s*\(/.test(text))).toEqual([]);
    });

    it('does not bypass Angular sanitization', () => {
      expect(offenders(code, (_, text) => /bypassSecurityTrust/.test(text))).toEqual([]);
      expect(offenders(templates, (_, text) => /\[innerHTML\]/.test(text))).toEqual([]);
    });
  });

  describe('components', () => {
    it('uses input(), output() and viewChild() instead of decorators', () => {
      expect(
        offenders(code, (_, text) => /@(Input|Output|HostBinding|HostListener|ViewChild|ViewChildren|ContentChild|ContentChildren)\(/.test(text)),
      ).toEqual([]);
    });

    it('injects with inject(), not through the constructor', () => {
      expect(
        offenders(
          code,
          (_, text) =>
            /@(Component|Directive|Injectable|Pipe)\(/.test(text) &&
            /constructor\s*\(\s*(private|public|protected|readonly)\b/.test(text),
        ),
      ).toEqual([]);
    });

    it('has no any', () => {
      expect(offenders(code, (_, text) => /:\s*any\b|\bas any\b|<any>/.test(text))).toEqual([]);
    });

    it('makes every component OnPush', () => {
      expect(
        offenders(code, (_, text) => /@Component\(/.test(text) && !/ChangeDetectionStrategy\.OnPush/.test(text)),
      ).toEqual([]);
    });

    it('keeps templates and styles of features in their own files', () => {
      expect(
        offenders(
          code,
          (path, text) =>
            path.startsWith('/src/app/features/') &&
            /@Component\(/.test(text) &&
            /^\s*(template|styles)\s*:/m.test(text),
        ),
      ).toEqual([]);
    });

    it('does not declare standalone, the default', () => {
      expect(offenders(code, (_, text) => /standalone:\s*true/.test(text))).toEqual([]);
    });
  });

  describe('forms', () => {
    it('builds every reactive group with fb.nonNullable.group', () => {
      expect(offenders(code, (_, text) => /\bfb\.group\(/.test(text))).toEqual([]);
    });
  });

  describe('templates', () => {
    it('uses native control flow', () => {
      expect(offenders(templates, (_, text) => /\*ng(If|For|Switch)/.test(text))).toEqual([]);
    });

    it('binds classes and styles directly', () => {
      expect(offenders(templates, (_, text) => /\[ng(Class|Style)\]/.test(text))).toEqual([]);
    });

    it('receives its state as signals', () => {
      expect(offenders(templates, (_, text) => /\|\s*async\b/.test(text))).toEqual([]);
    });
  });

  describe('time', () => {
    it('never converts to UTC', () => {
      expect(offenders(code, (_, text) => /toISOString\(\)|getUTC|toUTCString/.test(text))).toEqual([]);
    });
  });
});
