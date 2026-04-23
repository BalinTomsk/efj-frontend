import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-activate',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activate.component.html',
  styleUrl: './activate.component.css',
})
export class ActivateComponent implements OnInit {
  message = 'Activating your account...';
  isLoading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const activationToken = this.route.snapshot.paramMap.get('activationToken');

    if (!activationToken) {
      this.message = 'Invalid activation link.';
      this.isLoading = false;
      setTimeout(() => this.router.navigate(['/login']), 1500);
      return;
    }

    this.http.get(`/api/auth/activate/${activationToken}`).subscribe({
      next: () => {
        this.message = 'Account activated successfully.';
        this.isLoading = false;
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (error) => {
        this.message = error.error?.error || 'Activation failed.';
        this.isLoading = false;
        setTimeout(() => this.router.navigate(['/login']), 2000);
      }
    });
  }

  goToHome(): void {
    this.router.navigate(['/login']);
  }
}
