import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { RUNTIME_CONFIG } from '../../core/config/runtime-config';
import type { FactorizationResult } from './factorization.model';
import type { Matrix } from './matrix-parser';

@Injectable({ providedIn: 'root' })
export class FactorizationService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);

  factorize(matrix: Matrix): Observable<FactorizationResult> {
    return this.http.post<FactorizationResult>(`${this.config.qrApiUrl}/api/v1/qr-factorizations`, {
      matrix,
    });
  }
}
