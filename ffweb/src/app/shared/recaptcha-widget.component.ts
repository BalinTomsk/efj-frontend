import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    __fishFindRecaptchaLoader?: Promise<void>;
  }
}

interface Grecaptcha {
  ready(callback: () => void): void;
  render(
    container: HTMLElement,
    parameters: {
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      sitekey: string;
      theme?: 'light' | 'dark';
    }
  ): number;
  reset(widgetId?: number): void;
}

@Component({
  selector: 'app-recaptcha-widget',
  standalone: true,
  template: `
    <div #container class="recaptcha-widget"></div>
    @if (loadError) {
      <div class="recaptcha-load-error">
        CAPTCHA could not be loaded. Please refresh and try again.
      </div>
    }
  `
})
export class RecaptchaWidgetComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) siteKey = '';
  @Output() readonly resolved = new EventEmitter<string | null>();
  @ViewChild('container', { static: true }) private containerRef?: ElementRef<HTMLElement>;

  loadError = false;
  private widgetId: number | null = null;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.loadScript();
      if (this.destroyed) {
        return;
      }

      window.grecaptcha?.ready(() => {
        if (this.destroyed || this.widgetId !== null) {
          return;
        }

        const container = this.containerRef?.nativeElement;
        if (!container || !window.grecaptcha) {
          this.loadError = true;
          return;
        }

        this.widgetId = window.grecaptcha.render(container, {
          sitekey: this.siteKey,
          theme: 'light',
          callback: (token: string) => this.resolved.emit(token),
          'expired-callback': () => this.resolved.emit(null),
          'error-callback': () => {
            this.loadError = true;
            this.resolved.emit(null);
          }
        });
      });
    } catch {
      this.loadError = true;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  reset(): void {
    this.resolved.emit(null);
    if (this.widgetId !== null) {
      window.grecaptcha?.reset(this.widgetId);
    }
  }

  private loadScript(): Promise<void> {
    if (window.grecaptcha) {
      return Promise.resolve();
    }

    if (window.__fishFindRecaptchaLoader) {
      return window.__fishFindRecaptchaLoader;
    }

    window.__fishFindRecaptchaLoader = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-fishfind-recaptcha="true"]'
      );

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('reCAPTCHA failed to load')), {
          once: true
        });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset['fishfindRecaptcha'] = 'true';
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('reCAPTCHA failed to load')), {
        once: true
      });
      document.head.appendChild(script);
    });

    return window.__fishFindRecaptchaLoader;
  }
}
