import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, map, tap, timeout } from 'rxjs/operators';

export interface User {
  id: number;
  username: string;
  email: string;
  titul?: string;
  cell?: string;
  question?: string;
  answer?: string;
  lastVisit?: string;
  suspended?: number;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  message?: string;
}

export interface ProfileResponse {
  user: User;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  titul?: string;
  question?: string;
  answer?: string;
  cell?: string;
  recaptchaToken?: string | undefined;
}

export interface RegisterResponse {
  message: string;
  activationUrl?: string;
}

export interface ResendActivationRequest {
  email: string;
}

export interface ResendActivationResponse {
  message: string;
}

export interface GlobalConfigurationCounterResponse {
  configAttribute: string;
  configValue: string;
}

export interface StartSessionRequest {
  startPage: string;
}

export interface StartSessionResponse {
  message: string;
  sessionId: string;
}

export interface SessionPageViewRequest {
  sessionId: string;
  pagePath: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = '/api';
  private readonly LOGIN_TIMEOUT_MS = 5_000;
  private readonly tokenKey = 'auth_token';

  private userSubject = new BehaviorSubject<User | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);

  public user$ = this.userSubject.asObservable();
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  private _currentUser = signal<User | null>(null);
  private _isAuthenticated = signal<boolean>(false);
  private _isAccessRestricted = signal<boolean>(false);

  public currentUser = computed(() => this._currentUser());
  public isAuthenticated = computed(() => this._isAuthenticated());
  public isAccessRestricted = computed(() => this._isAccessRestricted());

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeAuthState();
  }

  private initializeAuthState(): void {
    const token = localStorage.getItem(this.tokenKey);
    if (!token) {
      return;
    }

    this.http.get<ProfileResponse>(`${this.API_URL}/auth/validate`, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => response.user)
    ).subscribe({
      next: (user) => {
        this._isAccessRestricted.set(false);
        this.setAuthenticatedUser(user, token);
      },
      error: (error) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.restrictAccess();
          return;
        }

        this.logout();
      }
    });
  }

  private setAuthenticatedUser(user: User, token: string): void {
    localStorage.setItem(this.tokenKey, token);
    this._currentUser.set(user);
    this._isAuthenticated.set(true);
    this.userSubject.next(user);
    this.isAuthenticatedSubject.next(true);
  }

  private clearAuthState(): void {
    localStorage.removeItem(this.tokenKey);
    this._currentUser.set(null);
    this._isAuthenticated.set(false);
    this.userSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  restrictAccess(): void {
    this.clearAuthState();
    this._isAccessRestricted.set(true);
  }

  clearRestrictedAccess(): void {
    this._isAccessRestricted.set(false);
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = localStorage.getItem(this.tokenKey);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/auth/login`, credentials).pipe(
      timeout(this.LOGIN_TIMEOUT_MS),
      tap((response) => {
        this.clearRestrictedAccess();
        this.setAuthenticatedUser(response.user, response.token);
      }),
      catchError(this.handleError)
    );
  }

  register(userData: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.API_URL}/auth/register`, userData).pipe(
      catchError(this.handleError)
    );
  }

  resendActivationEmail(payload: ResendActivationRequest): Observable<ResendActivationResponse> {
    return this.http.post<ResendActivationResponse>(`${this.API_URL}/auth/resend-activation`, payload).pipe(
      catchError(this.handleError)
    );
  }

  getVisitorCounter(): Observable<string> {
    return this.http.get<GlobalConfigurationCounterResponse>(`${this.API_URL}/global-configuration/counter`).pipe(
      map((response) => response.configValue || '0'),
      catchError(this.handleError)
    );
  }

  startSession(payload: StartSessionRequest): Observable<string> {
    return this.http.post<StartSessionResponse>(`${this.API_URL}/session/start`, payload, {
      headers: this.getAuthHeaders()
    }).pipe(
      map((response) => response.sessionId),
      catchError(this.handleError)
    );
  }

  recordSessionPageView(payload: SessionPageViewRequest): Observable<void> {
    return this.http.post<{ message: string }>(`${this.API_URL}/session/page-view`, payload, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(() => undefined),
      catchError(this.handleError)
    );
  }

  checkAccessStatus(): Observable<void> {
    return this.http.get<{ status: string }>(`${this.API_URL}/health`).pipe(
      map(() => undefined)
    );
  }

  logout(): void {
    this.clearAuthState();
    this.clearRestrictedAccess();
    this.router.navigate(['/']);
  }

  validateToken(): Observable<User> {
    return this.http.get<ProfileResponse>(`${this.API_URL}/auth/validate`, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => response.user),
      catchError(this.handleError)
    );
  }

  getProfile(): Observable<User> {
    return this.http.get<ProfileResponse>(`${this.API_URL}/auth/profile`, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => response.user),
      catchError(this.handleError)
    );
  }

  updateProfile(email: string, cell: string): Observable<User> {
    return this.http.put<{ user: User }>(`${this.API_URL}/auth/profile`, { email, cell }, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => response.user),
      tap((updatedUser) => {
        this._currentUser.set(updatedUser);
        this.userSubject.next(updatedUser);
      }),
      catchError(this.handleError)
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.API_URL}/auth/change-password`, { currentPassword, newPassword }, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  deleteAccount(): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/auth/account`, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(() => {
        this.logout();
      }),
      catchError(this.handleError)
    );
  }

  private handleError = (error: unknown): Observable<never> => {
    let errorMessage = 'An unknown error occurred';

    console.error('HTTP Error Response:', error);
    if (error instanceof TimeoutError) {
      errorMessage = `Sign in timed out after ${this.LOGIN_TIMEOUT_MS / 1000} seconds. Please try again.`;
    } else if (error instanceof HttpErrorResponse) {
      console.error('Error Status:', error.status);
      console.error('Error Body:', error.error);

      if (error.status === 0) {
        errorMessage = 'Unable to reach the server. Please try again.';
      } else if (error.status === 403) {
        errorMessage = error.error?.error || 'Access denied';
      } else if (error.status === 404) {
        this.restrictAccess();
        errorMessage = error.error?.error || 'Endpoint not found';
      } else if (error.status === 401) {
        errorMessage = error.error?.error || 'Authentication failed';
      } else if (error.status === 409) {
        errorMessage = error.error?.error || 'User already exists';
      } else if (error.status === 400) {
        errorMessage = error.error?.error || 'Invalid request data';
      } else if (error.status === 500) {
        errorMessage = error.error?.error || 'Server error';
      } else if (error.error instanceof ErrorEvent) {
        errorMessage = error.error.message;
      } else if (error.error?.error) {
        errorMessage = error.error.error;
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
    } else if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }

    console.error('Final error message:', errorMessage);
    return throwError(() => new Error(errorMessage));
  };
}
