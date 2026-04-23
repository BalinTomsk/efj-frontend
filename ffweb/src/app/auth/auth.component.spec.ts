import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, AuthResponse, RegisterResponse } from '../auth.service';
import { AuthComponent } from './auth.component';

describe('AuthComponent', () => {
  let component: AuthComponent;
  let fixture: ComponentFixture<AuthComponent>;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    resendActivationEmail: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  const successfulAuthResponse: AuthResponse = {
    token: 'jwt-token',
    user: {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      created_at: '2026-03-15T00:00:00.000Z',
      updated_at: '2026-03-15T00:00:00.000Z'
    }
  };

  const successfulRegisterResponse: RegisterResponse = {
    message: 'Account created. Check your email to activate your account. The link expires after 30 minutes.',
    activationUrl: 'http://localhost:4200/activate/test-token'
  };

  beforeEach(async () => {
    authService = {
      login: vi.fn(),
      register: vi.fn(),
      resendActivationEmail: vi.fn()
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [AuthComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function fillValidRegistrationForm(): void {
    component.registerData.username = 'newuser';
    component.registerData.email = 'newuser@example.com';
    component.registerData.confirmEmail = 'newuser@example.com';
    component.registerData.password = 'password123';
    component.registerData.confirmPassword = 'password123';
    component.reCaptchaToken = 'captcha-token';
  }

  describe('login', () => {
    it('starts in login mode', () => {
      expect(component.isLoginMode).toBe(true);
      expect(component.registrationSucceeded).toBe(false);
    });

    it.each([
      { login: '', password: '', label: 'missing login and password' },
      { login: '', password: 'password123', label: 'missing login only' },
      { login: 'testuser', password: '', label: 'missing password only' }
    ])('shows validation error for $label', ({ login, password }) => {
      component.loginData.login = login;
      component.loginData.password = password;

      component.onLogin();

      expect(component.error).toBe('Please fill in all fields');
      expect(component.isLoading).toBe(false);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('submits valid login credentials and navigates home on success', async () => {
      authService.login.mockReturnValue(of(successfulAuthResponse));
      component.loginData.login = 'testuser';
      component.loginData.password = 'password123';

      component.onLogin();
      await fixture.whenStable();

      expect(authService.login).toHaveBeenCalledWith({
        login: 'testuser',
        password: 'password123'
      });
      expect(component.error).toBeNull();
      expect(component.isLoading).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('clears an old error before retrying login', async () => {
      authService.login.mockReturnValue(of(successfulAuthResponse));
      component.error = 'Previous error';
      component.loginData.login = 'testuser';
      component.loginData.password = 'password123';

      component.onLogin();
      await fixture.whenStable();

      expect(component.error).toBeNull();
    });

    it('shows the backend login error message', () => {
      authService.login.mockReturnValue(
        throwError(() => new Error('Invalid credentials'))
      );
      component.loginData.login = 'testuser';
      component.loginData.password = 'wrongpassword';

      component.onLogin();

      expect(component.error).toBe('Invalid credentials');
      expect(component.isLoading).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('falls back to a default login error when the error has no message', () => {
      authService.login.mockReturnValue(
        throwError(() => ({ unexpected: true }))
      );
      component.loginData.login = 'testuser';
      component.loginData.password = 'wrongpassword';

      component.onLogin();

      expect(component.error).toBe('Login failed');
      expect(component.isLoading).toBe(false);
    });

    it('shows timeout message when login never resolves', () => {
      vi.useFakeTimers();
      authService.login.mockReturnValue(NEVER);
      component.loginData.login = 'testuser';
      component.loginData.password = 'password123';

      component.onLogin();

      expect(component.isLoading).toBe(true);
      vi.advanceTimersByTime(5_000);

      expect(component.error).toBe('Sign in timed out after 5 seconds. Please try again.');
      expect(component.isLoading).toBe(false);
    });

    it('switches to register mode and clears login errors', () => {
      component.error = 'Bad login';

      component.showRegister();

      expect(component.isLoginMode).toBe(false);
      expect(component.error).toBeNull();
      expect(component.registrationSucceeded).toBe(false);
      expect(component.reCaptchaToken).toBeNull();
    });
  });

  describe('registration', () => {
    beforeEach(() => {
      component.showRegister();
    });

    it.each([
      'username',
      'email',
      'confirmEmail',
      'password',
      'confirmPassword'
    ] as const)('requires %s', (missingField) => {
      fillValidRegistrationForm();
      switch (missingField) {
        case 'username':
          component.registerData.username = '';
          break;
        case 'email':
          component.registerData.email = '';
          break;
        case 'confirmEmail':
          component.registerData.confirmEmail = '';
          break;
        case 'password':
          component.registerData.password = '';
          break;
        case 'confirmPassword':
          component.registerData.confirmPassword = '';
          break;
      }

      component.onRegister();

      expect(component.error).toBe('Please fill in all required fields');
      expect(component.isLoading).toBe(false);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('rejects mismatched emails', () => {
      fillValidRegistrationForm();
      component.registerData.confirmEmail = 'other@example.com';

      component.onRegister();

      expect(component.error).toBe('Email addresses do not match');
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords', () => {
      fillValidRegistrationForm();
      component.registerData.confirmPassword = 'different-password';

      component.onRegister();

      expect(component.error).toBe('Passwords do not match');
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('rejects short passwords', () => {
      fillValidRegistrationForm();
      component.registerData.password = 'short';
      component.registerData.confirmPassword = 'short';

      component.onRegister();

      expect(component.error).toBe('Password must be at least 6 characters long');
      expect(authService.register).not.toHaveBeenCalled();
    });

    it.each([
      { question: 'Pet name?', answer: '', label: 'question without answer' },
      { question: '', answer: 'Fluffy', label: 'answer without question' }
    ])('rejects recovery pair with $label', ({ question, answer }) => {
      fillValidRegistrationForm();
      component.registerData.question = question;
      component.registerData.answer = answer;

      component.onRegister();

      expect(component.error).toBe('Recovery question and answer must both be filled in');
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('requires captcha before registration', () => {
      fillValidRegistrationForm();
      component.reCaptchaToken = null;

      component.onRegister();

      expect(component.error).toBe('Please complete the CAPTCHA');
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('clears captcha error after captcha is resolved', () => {
      component.error = 'Please complete the CAPTCHA';

      component.onCaptchaResolved('captcha-token');

      expect(component.reCaptchaToken).toBe('captcha-token');
      expect(component.error).toBeNull();
    });

    it('submits minimal valid registration data', () => {
      authService.register.mockReturnValue(of(successfulRegisterResponse));
      fillValidRegistrationForm();

      component.onRegister();

      expect(authService.register).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        recaptchaToken: 'captcha-token'
      });
      expect(component.registrationSucceeded).toBe(true);
      expect(component.error).toBeNull();
      expect(component.isLoading).toBe(false);
      expect(component.registrationMessage).toContain('expires after 30 minutes');
    });

    it('trims and includes optional registration fields when provided', () => {
      authService.register.mockReturnValue(of(successfulRegisterResponse));
      fillValidRegistrationForm();
      component.registerData.titul = '  Captain ';
      component.registerData.question = ' Favorite fish? ';
      component.registerData.answer = ' Salmon ';
      component.registerData.cell = ' 555-0101 ';

      component.onRegister();

      expect(authService.register).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        recaptchaToken: 'captcha-token',
        titul: 'Captain',
        question: 'Favorite fish?',
        answer: 'Salmon',
        cell: '555-0101'
      });
      expect(component.registrationMessage).toBe('Account created. Check your email to activate your account. The link expires after 30 minutes.');
      expect(component.resendActivationMessage).toBe('If the message does not arrive, check your spam folder or resend the activation email.');
    });

    it('shows the backend registration message without rendering an activation link', () => {
      authService.register.mockReturnValue(of({
        message: 'Account created, but activation email could not be sent.',
        activationUrl: 'http://localhost:4200/activate/test-token'
      }));
      fillValidRegistrationForm();

      component.onRegister();
      fixture.detectChanges();

      expect(component.registrationSucceeded).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Account created, but activation email could not be sent.');
      expect(fixture.nativeElement.textContent).not.toContain('Activation link:');
      expect(fixture.nativeElement.textContent).not.toContain('http://localhost:4200/activate/test-token');
    });

    it('resends an activation email for the entered email address', () => {
      authService.resendActivationEmail.mockReturnValue(of({
        message: 'A new activation email has been sent. The new link expires after 30 minutes.'
      }));
      component.registerData.email = 'newuser@example.com';

      component.resendActivationEmail();

      expect(authService.resendActivationEmail).toHaveBeenCalledWith({
        email: 'newuser@example.com'
      });
      expect(component.resendActivationMessage).toBe('A new activation email has been sent. The new link expires after 30 minutes.');
      expect(component.error).toBeNull();
      expect(component.isResendingActivation).toBe(false);
    });

    it('requires an email before resending an activation email', () => {
      component.registerData.email = '   ';

      component.resendActivationEmail();

      expect(authService.resendActivationEmail).not.toHaveBeenCalled();
      expect(component.error).toBe('Enter your email address to resend the activation link');
    });

    it('shows backend registration errors and resets captcha token', () => {
      authService.register.mockReturnValue(
        throwError(() => new Error('Email already exists'))
      );
      fillValidRegistrationForm();

      component.onRegister();

      expect(component.error).toBe('Email already exists');
      expect(component.reCaptchaToken).toBeNull();
      expect(component.registrationSucceeded).toBe(false);
      expect(component.isLoading).toBe(false);
    });

    it('falls back to a default registration error when the error has no message', () => {
      authService.register.mockReturnValue(
        throwError(() => ({ unexpected: true }))
      );
      fillValidRegistrationForm();

      component.onRegister();

      expect(component.error).toBe('An unknown error occurred during registration');
      expect(component.reCaptchaToken).toBeNull();
      expect(component.isLoading).toBe(false);
    });

    it('returns to login mode after successful registration when continue is clicked', () => {
      component.registrationSucceeded = true;
      component.isLoginMode = false;

      component.continueToLogin();

      expect(component.isLoginMode).toBe(true);
      expect(component.registrationSucceeded).toBe(false);
      expect(component.error).toBeNull();
    });
  });
});
