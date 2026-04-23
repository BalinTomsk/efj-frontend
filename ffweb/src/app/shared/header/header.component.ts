import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="header-wrapper">
      @if (!authenticated) {
        <div class="guest-header">
          <div class="guest-top-row">
            <a routerLink="/" class="guest-logo-link" aria-label="FishForecast home">
              <img src="images/menu/fslogo.png" alt="FishForecast" class="guest-logo" />
            </a>

            <a routerLink="/login" class="guest-register-link" aria-label="Register or sign in">
              <img src="images/menu/login.png" alt="Register" title="Register" />
            </a>
          </div>

          <nav class="guest-icon-menu" aria-label="Guest navigation">
            @for (item of guestMenuItems; track $index) {
              @if (item.placeholder) {
                <span class="guest-icon-placeholder" aria-hidden="true"></span>
              } @else {
                <a [routerLink]="item.route" class="guest-icon-link" [attr.aria-label]="item.label">
                  <img [src]="item.icon" [alt]="item.label" [title]="item.label" />
                </a>
              }
            }
          </nav>
        </div>
      } @else {
        <div class="header-content">
          <a routerLink="/" class="logo">
            <img src="images/menu/fslogo.png" alt="fish find" height="43" />
          </a>

          <nav class="app-nav" aria-label="Account navigation">
            <div class="nav-account-group">
              <button (click)="logoutClicked.emit()" class="nav-link nav-button" type="button">
                <span class="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" focusable="false">
                    <path d="M6 2.5h5.5v11H6" />
                    <path d="M1.5 8h7" />
                    <path d="M5.5 5L8.5 8l-3 3" />
                  </svg>
                </span>
                <span>Sign Out</span>
              </button>

              <a routerLink="/profile" class="nav-link nav-account-link">
                {{ username }}
              </a>
            </div>
          </nav>
        </div>
      }
    </header>
  `,
  styles: [`
    .header-wrapper {
      width: 100%;
      padding: 0;
      margin: 0;
    }

    .guest-header {
      width: 100%;
      min-height: 108px;
      background-color: #5678ab;
      box-sizing: border-box;
      padding: 8px 18px 10px 18px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 12px;
    }

    .guest-top-row {
      width: 100%;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .guest-logo-link {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
    }

    .guest-logo {
      display: block;
      width: 185px;
      height: auto;
    }

    .guest-register-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      text-decoration: none;
      flex: 0 0 auto;
      margin-top: 6px;
    }

    .guest-register-link img {
      display: block;
      width: 24px;
      height: 24px;
      object-fit: contain;
    }

    .guest-icon-menu {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-left: 2px;
      flex-wrap: wrap;
    }

    .guest-icon-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      text-decoration: none;
      flex: 0 0 auto;
    }

    .guest-icon-placeholder {
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      visibility: hidden;
    }

    .guest-icon-link img {
      display: block;
      width: 24px;
      height: 24px;
      object-fit: contain;
    }

    .header-content {
      width: 100%;
      min-height: 100px;
      background-color: #4A6FA5;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      padding: 0 10px;
      box-sizing: border-box;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .logo {
      text-decoration: none;
      display: flex;
      align-items: flex-start;
    }

    .logo img {
      position: relative;
      top: 3px;
      display: block;
    }

    .app-nav {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .nav-account-group {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .nav-link {
      color: white;
      text-decoration: none;
      padding: 0;
      margin-top: 10px;
      transition: background-color 0.2s;
      cursor: pointer;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .nav-link:hover,
    .guest-register-link:hover,
    .guest-icon-link:hover {
      background-color: transparent;
    }

    .nav-button {
      background: transparent;
      border: 0;
      font-size: 1rem;
      font: inherit;
      color: inherit;
    }

    .nav-account-link {
      font-weight: 700;
      margin-top: 0;
    }

    .nav-icon {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .nav-icon svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }

    @media (max-width: 840px) {
      .guest-header {
        padding: 8px 12px 10px 12px;
        gap: 10px;
      }

      .guest-logo {
        width: 160px;
      }

      .guest-register-link {
        margin-top: 4px;
      }

      .guest-icon-menu {
        gap: 10px;
      }

      .header-content {
        min-height: 0;
        padding-bottom: 10px;
        align-items: center;
      }
    }
  `]
})
export class HeaderComponent {
  @Input() authenticated = false;
  @Input() username = 'Account';
  @Output() logoutClicked = new EventEmitter<void>();

  protected readonly guestMenuItems = [
    { label: 'Species', icon: 'images/menu/Fish.png', route: '/' },
    { label: 'Lake', icon: 'images/menu/lake.png', route: '/' },
    { placeholder: true },
    { label: 'Watershield', icon: 'images/menu/Watershield.png', route: '/' },
    { label: 'Creek', icon: 'images/menu/Creek.png', route: '/' },
    { placeholder: true },
    { label: 'River', icon: 'images/menu/River.png', route: '/' },
    { label: 'Forecast', icon: 'images/menu/Forecast.png', route: '/' },
    { label: 'News', icon: 'images/menu/News.png', route: '/' },
    { placeholder: true }
  ];
}
