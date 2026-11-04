import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatNumber } from '../matrix-math';
import type { Matrix } from '../matrix-parser';

/** The API accepts 200×200: drawing 40 000 cells per matrix would freeze the browser. */
export const MAX_DISPLAYED_DIMENSION = 12;

/** Draws a matrix between brackets, the way it would be written by hand. */
@Component({
  selector: 'app-matrix-view',
  templateUrl: './matrix-view.html',
  styleUrl: './matrix-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatrixView {
  readonly name = input.required<string>();
  readonly rows = input.required<Matrix>();

  protected readonly maxDisplayed = MAX_DISPLAYED_DIMENSION;
  protected readonly rowCount = computed(() => this.rows().length);
  protected readonly columnCount = computed(() => this.rows()[0]?.length ?? 0);
  protected readonly isTruncated = computed(
    () => this.rowCount() > MAX_DISPLAYED_DIMENSION || this.columnCount() > MAX_DISPLAYED_DIMENSION,
  );
  protected readonly displayedRows = computed(() =>
    this.rows()
      .slice(0, MAX_DISPLAYED_DIMENSION)
      .map((row) =>
        row.slice(0, MAX_DISPLAYED_DIMENSION).map((value) => ({
          text: formatNumber(value),
          exact: String(value),
        })),
      ),
  );
}
