import { ChangeDetectorRef, Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService, RegisterRequest, RegisterResponse } from '../auth.service';
import { RecaptchaWidgetComponent } from '../shared/recaptcha-widget.component';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RecaptchaWidgetComponent],
  templateUrl: './auth.html',
  styleUrl: './auth.css'
})
export class AuthComponent {
  private readonly loginRequestTimeoutMs = 5_000;
  private readonly defaultRegistrationMessage = 'Please check your email to activate your account. The activation link expires after 30 minutes. If it does not arrive, check your spam folder.';

  isLoginMode = true;
  isLoading = false;
  isResendingActivation = false;
  registrationSucceeded = false;
  registrationMessage = this.defaultRegistrationMessage;
  resendActivationMessage: string | null = null;
  error: string | null = null;
  reCaptchaToken: string | null = null;
  readonly recaptchaSiteKey = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

  private authService = inject(AuthService);
  private router = inject(Router);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private pendingLoginTimeoutId: ReturnType<typeof setTimeout> | null = null;
  @ViewChild(RecaptchaWidgetComponent) private recaptchaComponent?: RecaptchaWidgetComponent;

  loginData = {
    login: '',
    password: ''
  };

  registerData = {
    username: '',
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
    titul: '',
    question: '',
    answer: '',
    cell: '',
    firstName: '',
    lastName: '',
    country: 'Canada',
    postalCode: '',
    agreeTerms: false
  };

  constructor() {}

  showLogin(): void {
    this.clearPendingLoginTimeout();
    this.isLoginMode = true;
    this.isResendingActivation = false;
    this.registrationSucceeded = false;
    this.registrationMessage = this.defaultRegistrationMessage;
    this.resendActivationMessage = null;
    this.error = null;
    this.refreshView();
  }

  showRegister(): void {
    this.clearPendingLoginTimeout();
    this.isLoginMode = false;
    this.isResendingActivation = false;
    this.registrationSucceeded = false;
    this.registrationMessage = this.defaultRegistrationMessage;
    this.resendActivationMessage = null;
    this.error = null;
    this.resetCaptcha();
    this.refreshView();
  }

  onLogin(): void {
    if (!this.loginData.login || !this.loginData.password) {
      this.error = 'Please fill in all fields';
      console.log('Login validation failed: empty fields');
      this.refreshView();
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.startPendingLoginTimeout();

    console.log('Attempting login with:', { login: this.loginData.login });

    this.authService.login({
      login: this.loginData.login,
      password: this.loginData.password
    }).pipe(
      finalize(() => {
        this.clearPendingLoginTimeout();
        this.isLoading = false;
        this.refreshView();
      })
    ).subscribe({
      next: (response) => {
        console.log('Login successful:', response);
        this.error = null;
        this.refreshView();
        console.log('Navigating to home page');
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('Login error:', error);
        this.error = this.getErrorMessage(error, 'Login failed');
        this.refreshView();
      }
    });
  }

  onRegister(): void {
    if (
      !this.registerData.username ||
      !this.registerData.email ||
      !this.registerData.confirmEmail ||
      !this.registerData.password ||
      !this.registerData.confirmPassword
    ) {
      this.error = 'Please fill in all required fields';
      return;
    }

    if (this.registerData.email !== this.registerData.confirmEmail) {
      this.error = 'Email addresses do not match';
      return;
    }

    if (this.registerData.password !== this.registerData.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    if (this.registerData.password.length < 6) {
      this.error = 'Password must be at least 6 characters long';
      return;
    }

    if ((this.registerData.question && !this.registerData.answer) || (!this.registerData.question && this.registerData.answer)) {
      this.error = 'Recovery question and answer must both be filled in';
      return;
    }

    if (!this.reCaptchaToken) {
      this.error = 'Please complete the CAPTCHA';
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.performRegistration();
  }

  private performRegistration(): void {
    const registrationRequest: RegisterRequest = {
      username: this.registerData.username,
      email: this.registerData.email,
      password: this.registerData.password,
      recaptchaToken: this.reCaptchaToken ?? undefined
    };

    if (this.registerData.titul.trim()) {
      registrationRequest.titul = this.registerData.titul.trim();
    }

    if (this.registerData.question.trim()) {
      registrationRequest.question = this.registerData.question.trim();
    }

    if (this.registerData.answer.trim()) {
      registrationRequest.answer = this.registerData.answer.trim();
    }

    if (this.registerData.cell.trim()) {
      registrationRequest.cell = this.registerData.cell.trim();
    }

    this.authService.register(registrationRequest).pipe(
      finalize(() => {
        this.isLoading = false;
        this.refreshView();
      })
    ).subscribe({
      next: (response: RegisterResponse) => {
        console.log('Registration successful:', response);
        this.error = null;
        this.registrationSucceeded = true;
        this.registrationMessage = response.message || this.defaultRegistrationMessage;
        this.resendActivationMessage = 'If the message does not arrive, check your spam folder or resend the activation email.';
        this.resetCaptcha();
        this.refreshView();
      },
      error: (error) => {
        console.error('Registration error object:', error);
        console.error('Registration error message:', error?.message);
        this.error = this.getErrorMessage(error, 'An unknown error occurred during registration');
        console.log('Displaying error:', this.error);
        this.resetCaptcha();
        this.refreshView();
      }
    });
  }

  onCaptchaResolved(token: string | null): void {
    this.reCaptchaToken = token;
    if (token && this.error === 'Please complete the CAPTCHA') {
      this.error = null;
    }
    this.refreshView();
  }

  private resetCaptcha(): void {
    this.reCaptchaToken = null;
    this.recaptchaComponent?.reset();
  }

  private startPendingLoginTimeout(): void {
    this.clearPendingLoginTimeout();

    this.pendingLoginTimeoutId = setTimeout(() => {
      this.pendingLoginTimeoutId = null;

      if (!this.isLoading) {
        return;
      }

      this.isLoading = false;
      this.error = `Sign in timed out after ${this.loginRequestTimeoutMs / 1000} seconds. Please try again.`;
      this.refreshView();
    }, this.loginRequestTimeoutMs);
  }

  private clearPendingLoginTimeout(): void {
    if (this.pendingLoginTimeoutId !== null) {
      clearTimeout(this.pendingLoginTimeoutId);
      this.pendingLoginTimeoutId = null;
    }
  }

  private getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return fallbackMessage;
  }

  private refreshView(): void {
    this.changeDetectorRef.detectChanges();
  }

  continueToLogin(): void {
    this.showLogin();
  }

  resendActivationEmail(): void {
    const email = this.registerData.email.trim();

    if (!email) {
      this.error = 'Enter your email address to resend the activation link';
      this.resendActivationMessage = null;
      this.refreshView();
      return;
    }

    this.isResendingActivation = true;
    this.error = null;
    this.resendActivationMessage = null;
    this.refreshView();

    this.authService.resendActivationEmail({ email }).pipe(
      finalize(() => {
        this.isResendingActivation = false;
        this.refreshView();
      })
    ).subscribe({
      next: (response) => {
        this.resendActivationMessage = response.message;
        this.error = null;
        this.refreshView();
      },
      error: (error) => {
        this.error = this.getErrorMessage(error, 'Unable to resend activation email');
        this.resendActivationMessage = null;
        this.refreshView();
      }
    });
  }

  loginWithGoogle(): void {
    alert('OAuth 2.1 with Google - Implementation needed');
  }
}
