import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService, User } from '../auth.service';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  private readonly profileLoadTimeoutMs = 5_000;

  user: User | null = null;
  isLoading = false;
  error: string | null = null;
  success: string | null = null;
  private pendingProfileLoadTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Edit profile form
  editMode = false;
  editData = {
    email: '',
    cell: ''
  };

  // Change password form
  showPasswordForm = false;
  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  constructor(
    private authService: AuthService,
    private router: Router,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      this.refreshView();
      return;
    }

    this.loadUserProfile();
  }

  loadUserProfile(): void {
    this.isLoading = true;
    this.error = null;
    this.startProfileLoadTimeout();
    this.authService.getProfile().pipe(
      finalize(() => {
        this.clearProfileLoadTimeout();
      })
    ).subscribe({
      next: (user) => {
        this.user = user;
        this.editData = {
          email: this.user.email,
          cell: this.user.cell ?? ''
        };
        this.isLoading = false;
        this.refreshView();
      },
      error: (error) => {
        this.error = error.message;
        this.isLoading = false;
        this.refreshView();
      }
    });
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    this.error = null;
    this.success = null;
    if (this.editMode && this.user) {
      this.editData = {
        email: this.user.email,
        cell: this.user.cell ?? ''
      };
    }
  }

  saveProfile(): void {
    if (!this.editData.email) {
      this.error = 'Email is required';
      this.refreshView();
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.authService.updateProfile(this.editData.email, this.editData.cell)
      .subscribe({
        next: (user) => {
          this.user = user;
          this.editMode = false;
          this.success = 'Profile updated successfully';
          this.isLoading = false;
          this.refreshView();
        },
        error: (error) => {
          this.error = error.message;
          this.isLoading = false;
          this.refreshView();
        }
      });
  }

  togglePasswordForm(): void {
    this.showPasswordForm = !this.showPasswordForm;
    this.error = null;
    this.success = null;
    if (!this.showPasswordForm) {
      this.passwordData = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    }
  }

  changePassword(): void {
    if (!this.passwordData.currentPassword || !this.passwordData.newPassword || !this.passwordData.confirmPassword) {
      this.error = 'All password fields are required';
      this.refreshView();
      return;
    }

    if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
      this.error = 'New passwords do not match';
      this.refreshView();
      return;
    }

    if (this.passwordData.newPassword.length < 6) {
      this.error = 'New password must be at least 6 characters long';
      this.refreshView();
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.authService.changePassword(this.passwordData.currentPassword, this.passwordData.newPassword)
      .subscribe({
        next: () => {
          this.showPasswordForm = false;
          this.success = 'Password changed successfully';
          this.passwordData = {
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
          };
          this.isLoading = false;
          this.refreshView();
        },
        error: (error) => {
          this.error = error.message;
          this.isLoading = false;
          this.refreshView();
        }
      });
  }

  deleteAccount(): void {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.authService.deleteAccount().subscribe({
      next: () => {
        this.router.navigate(['/']);
        this.refreshView();
      },
      error: (error) => {
        this.error = error.message;
        this.isLoading = false;
        this.refreshView();
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
    this.refreshView();
  }

  private startProfileLoadTimeout(): void {
    this.clearProfileLoadTimeout();

    this.pendingProfileLoadTimeoutId = setTimeout(() => {
      this.pendingProfileLoadTimeoutId = null;

      if (!this.isLoading) {
        return;
      }

      this.isLoading = false;
      this.error = `Loading profile timed out after ${this.profileLoadTimeoutMs / 1000} seconds. Please try again.`;
      this.refreshView();
    }, this.profileLoadTimeoutMs);
  }

  private clearProfileLoadTimeout(): void {
    if (this.pendingProfileLoadTimeoutId !== null) {
      clearTimeout(this.pendingProfileLoadTimeoutId);
      this.pendingProfileLoadTimeoutId = null;
    }
  }

  private refreshView(): void {
    this.changeDetectorRef.detectChanges();
  }
}
