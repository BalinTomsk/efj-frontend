import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { NotFoundComponent } from './not-found/not-found.component';
import { HeaderComponent } from './shared/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, NotFoundComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('fishfind');
  protected readonly authService = inject(AuthService);
  protected readonly showHeader = signal(true);
  protected readonly visitorCounter = signal('0');
  private readonly activeSessionId = signal<string | null>(null);
  private readonly lastTrackedPath = signal<string>('');
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.updateHeaderVisibility();
    this.watchAccessStatus();
    this.startVisitorSession();
    this.loadVisitorCounter();

    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.updateHeaderVisibility();
      this.watchAccessStatus();
      this.recordRoutePageView();
    });
  }

  private watchAccessStatus(): void {
    this.authService.checkAccessStatus().subscribe({
      next: () => {
        this.authService.clearRestrictedAccess();
      },
      error: (error) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.authService.restrictAccess();
        }
      }
    });
  }

  logout(): void {
    this.authService.logout();
  }

  private startVisitorSession(): void {
    const currentPath = this.router.url.split('?')[0].split('#')[0] || '/';

    this.authService.startSession({ startPage: currentPath }).subscribe({
      next: (sessionId) => {
        this.activeSessionId.set(sessionId);
        this.lastTrackedPath.set(currentPath);
      },
      error: () => {
        // Session tracking should never block the app shell.
      }
    });
  }

  private recordRoutePageView(): void {
    const sessionId = this.activeSessionId();
    const currentPath = this.router.url.split('?')[0].split('#')[0] || '/';

    if (!sessionId || currentPath === this.lastTrackedPath()) {
      return;
    }

    this.authService.recordSessionPageView({ sessionId, pagePath: currentPath }).subscribe({
      next: () => {
        this.lastTrackedPath.set(currentPath);
      },
      error: () => {
        this.activeSessionId.set(null);
        this.startVisitorSession();
      }
    });
  }

  private loadVisitorCounter(): void {
    this.authService.getVisitorCounter().subscribe({
      next: (counterValue) => {
        this.visitorCounter.set(counterValue);
      },
      error: () => {
        this.visitorCounter.set('0');
      }
    });
  }

  private updateHeaderVisibility(): void {
    const currentPath = this.router.url.split('?')[0].split('#')[0];
    this.showHeader.set(currentPath !== '/register');
  }
}
