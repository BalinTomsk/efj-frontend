import { Component } from '@angular/core';

@Component({
  selector: 'app-not-found',
  standalone: true,
  template: `
    <section class="not-found">
      <div class="not-found-card">
        <h1>404</h1>
        <p>The page you requested could not be found.</p>
      </div>
    </section>
  `,
  styles: [`
    .not-found {
      min-height: 50vh;
      display: grid;
      place-items: center;
      padding: 2rem 1rem;
      box-sizing: border-box;
    }

    .not-found-card {
      width: min(420px, 100%);
      padding: 2rem;
      border: 1px solid #d7deea;
      background: linear-gradient(180deg, #ffffff 0%, #f3f7fc 100%);
      text-align: center;
      color: #415166;
    }

    h1 {
      margin: 0 0 0.5rem;
      font-size: 2.4rem;
      font-weight: 700;
    }

    p {
      margin: 0;
      font-size: 1rem;
    }
  `]
})
export class NotFoundComponent {}
