import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Statistics } from '../factorization.model';
import { formatNumber } from '../matrix-math';

/** Shows the statistics as notes in the margin of the notebook. */
@Component({
  selector: 'app-statistics-panel',
  templateUrl: './statistics-panel.html',
  styleUrl: './statistics-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatisticsPanel {
  readonly statistics = input.required<Statistics>();

  protected readonly entries = computed(() => {
    const { max, min, average, sum } = this.statistics();

    return [
      { label: 'Valor máximo', text: formatNumber(max), exact: String(max) },
      { label: 'Valor mínimo', text: formatNumber(min), exact: String(min) },
      { label: 'Promedio', text: formatNumber(average), exact: String(average) },
      { label: 'Suma total', text: formatNumber(sum), exact: String(sum) },
    ];
  });

  protected readonly diagonalAnswer = computed(() => {
    const diagonal = this.statistics()
      .matrices.filter((matrix) => matrix.isDiagonal)
      .map((matrix) => matrix.name);

    return diagonal.length === 0 ? 'No' : `Sí: ${diagonal.join(', ')}`;
  });
}
