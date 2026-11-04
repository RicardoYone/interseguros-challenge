import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, type Observable, tap } from 'rxjs';
import { RUNTIME_CONFIG } from '../config/runtime-config';

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

interface TokenResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
}

/**
 * Holds the session. The token lives only in memory, never in browser storage, so a
 * script injected into the page has nothing stored to steal. Reloading the page signs
 * the user out, a cost accepted for such a short-lived token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);

  private readonly token = signal<string | null>(null);

  readonly accessToken = this.token.asReadonly();
  readonly isAuthenticated = computed(() => this.token() !== null);

  get loginUrl(): string {
    return `${this.config.statisticsApiUrl}/api/v1/auth/token`;
  }

  login(credentials: Credentials): Observable<void> {
    return this.http.post<TokenResponse>(this.loginUrl, credentials).pipe(
      tap((response) => {
        this.token.set(response.accessToken);
      }),
      map(() => undefined),
    );
  }

  logout(): void {
    this.token.set(null);
  }
}
