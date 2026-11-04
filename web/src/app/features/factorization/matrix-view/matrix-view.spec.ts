import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MAX_DISPLAYED_DIMENSION, MatrixView } from './matrix-view';

async function render(rows: readonly (readonly number[])[]): Promise<ComponentFixture<MatrixView>> {
  const fixture = TestBed.createComponent(MatrixView);
  fixture.componentRef.setInput('name', 'Q');
  fixture.componentRef.setInput('rows', rows);
  await fixture.whenStable();

  return fixture;
}

const element = (fixture: ComponentFixture<MatrixView>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('MatrixView', () => {
  it('shows each value in its row and column', async () => {
    const fixture = await render([
      [1, 2],
      [3, 4],
    ]);

    const rows = [...element(fixture).querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
    );

    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('shows its name and dimensions', async () => {
    const fixture = await render([[1, 2, 3]]);

    const text = element(fixture).textContent;

    expect(text).toContain('Q');
    expect(text).toContain('1×3');
  });

  it('describes itself to screen readers', async () => {
    const fixture = await render([[1, 2, 3]]);

    expect(element(fixture).querySelector('caption')?.textContent).toContain(
      'Matriz Q de 1 filas por 3 columnas',
    );
  });

  it('rounds values for reading and keeps the exact one in the tooltip', async () => {
    const fixture = await render([[0.123456789]]);

    const cell = element(fixture).querySelector('td');

    expect(cell?.textContent.trim()).toBe('0.1235');
    expect(cell?.getAttribute('title')).toBe('0.123456789');
  });

  it('truncates a large matrix, says so, and still reports its real size', async () => {
    const size = MAX_DISPLAYED_DIMENSION + 3;
    const rows = new Array<number[]>(size).fill(new Array<number>(size).fill(1));

    const fixture = await render(rows);

    expect(element(fixture).querySelectorAll('tbody tr').length).toBe(MAX_DISPLAYED_DIMENSION);
    expect(element(fixture).querySelectorAll('tbody tr:first-child td').length).toBe(
      MAX_DISPLAYED_DIMENSION,
    );
    expect(element(fixture).textContent).toContain(`${size}×${size}`);
    expect(element(fixture).textContent).toContain(
      `Se muestran ${MAX_DISPLAYED_DIMENSION} filas y ${MAX_DISPLAYED_DIMENSION} columnas`,
    );
  });

  it('does not announce truncation for a small matrix', async () => {
    const fixture = await render([[1]]);

    expect(element(fixture).textContent).not.toContain('Se muestran');
  });
});
