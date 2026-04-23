import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { App } from './app';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  template: ''
})
class DummyPageComponent {}

class MockAuthService {
  private readonly accessRestricted = signal(false);
  private readonly authenticated = signal(false);
  private readonly currentUserValue = signal<{ username: string } | null>(null);
  private readonly shouldReturn404 = signal(false);

  isAuthenticated = () => this.authenticated();
  isAccessRestricted = () => this.accessRestricted();
  currentUser = () => this.currentUserValue();

  checkAccessStatus() {
    if (this.shouldReturn404()) {
      return throwError(() => new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        error: { error: 'Endpoint not found' }
      }));
    }

    return of(void 0);
  }

  getVisitorCounter() {
    return of('517984');
  }

  startSession() {
    return of('session-1');
  }

  recordSessionPageView() {
    return of(void 0);
  }

  restrictAccess(): void {
    this.accessRestricted.set(true);
    this.authenticated.set(false);
    this.currentUserValue.set(null);
  }

  clearRestrictedAccess(): void {
    this.accessRestricted.set(false);
  }

  logout(): void {
    this.authenticated.set(false);
    this.accessRestricted.set(false);
    this.currentUserValue.set(null);
  }

  setShouldReturn404(value: boolean): void {
    this.shouldReturn404.set(value);
  }

  setAuthenticatedUser(username: string): void {
    this.authenticated.set(true);
    this.currentUserValue.set({ username });
  }
}

describe('App', () => {
  let authService: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: DummyPageComponent },
          { path: 'login', component: DummyPageComponent },
          { path: 'profile', component: DummyPageComponent }
        ]),
        {
          provide: AuthService,
          useClass: MockAuthService
        }
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService) as unknown as MockAuthService;
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('should render the standard app shell when access is allowed', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.textContent).not.toContain('The page you requested could not be found.');
    expect(compiled.textContent).toContain('Visits: 517984');
  });

  it('should render only guest menu icons for unauthenticated users on non-login pages', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const guestMenuImages = compiled.querySelectorAll('.guest-icon-menu img');
    const guestLogo = compiled.querySelector('.guest-logo');
    const guestRegisterLink = compiled.querySelector('.guest-register-link img');

    expect(guestLogo).toBeTruthy();
    expect(guestRegisterLink).toBeTruthy();
    expect(guestMenuImages.length).toBe(7);
    expect(compiled.textContent).not.toContain('Sign In');
    expect(compiled.querySelector('a[routerlink="/profile"]')).toBeFalsy();
  });

  it('should render the signed-in account name as a profile link', () => {
    authService.setAuthenticatedUser('captainfish');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const accountLink = compiled.querySelector('a[routerlink="/profile"]');

    expect(accountLink?.textContent).toContain('captainfish');
  });

  it('should keep the header visible on the login page', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-header')).toBeTruthy();
  });

  it('should render the not found view when the backend reports suspended access with a 404', () => {
    authService.setShouldReturn404(true);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-not-found')).toBeTruthy();
    expect(compiled.textContent).toContain('The page you requested could not be found.');
    expect(compiled.querySelector('app-header')).toBeFalsy();
  });
});
