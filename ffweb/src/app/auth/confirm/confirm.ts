import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm',
  imports: [CommonModule],
  templateUrl: './confirm.html',
  styleUrl: './confirm.css',
})
export class ConfirmComponent implements OnInit {
  message: string = 'Confirming your email...';
  isLoading = true;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParams['token'];

    if (!token) {
      this.message = 'Invalid confirmation link.';
      this.isLoading = false;
      return;
    }

    this.http.get(`/api/auth/confirm?token=${token}`).subscribe({
      next: (response: any) => {
        this.message = response.message;
        this.isLoading = false;
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (error) => {
        this.message = error.error?.error || 'Confirmation failed.';
        this.isLoading = false;
      }
    });
  }
}