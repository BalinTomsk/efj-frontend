import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, User } from '../auth.service';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let authService: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    getProfile: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  const profileUser: User = {
    id: 7,
    username: 'captainfish',
    email: 'captain@fishfind.info',
    cell: '555-0101',
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T01:00:00.000Z'
  };

  beforeEach(async () => {
    authService = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      getProfile: vi.fn().mockReturnValue(of(profileUser)),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
      deleteAccount: vi.fn(),
      logout: vi.fn()
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('loads the current user profile on init', () => {
    expect(authService.getProfile).toHaveBeenCalled();
    expect(component.user?.username).toBe('captainfish');
    expect(component.editData.email).toBe('captain@fishfind.info');
    expect(component.editData.cell).toBe('555-0101');
  });

  it('stops loading and shows a timeout error when profile loading never resolves', () => {
    vi.useFakeTimers();
    authService.getProfile.mockReturnValue(NEVER);

    const stalledFixture = TestBed.createComponent(ProfileComponent);
    const stalledComponent = stalledFixture.componentInstance;
    stalledComponent.ngOnInit();

    expect(stalledComponent.isLoading).toBe(true);

    vi.advanceTimersByTime(5_000);

    expect(stalledComponent.isLoading).toBe(false);
    expect(stalledComponent.error).toBe('Loading profile timed out after 5 seconds. Please try again.');
  });

  it('redirects unauthenticated users to login', () => {
    authService.isAuthenticated.mockReturnValue(false);

    const unauthenticatedFixture = TestBed.createComponent(ProfileComponent);
    unauthenticatedFixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('requires email before saving profile changes', () => {
    component.toggleEditMode();
    component.editData.email = '';

    component.saveProfile();

    expect(component.error).toBe('Email is required');
    expect(authService.updateProfile).not.toHaveBeenCalled();
  });

  it('updates email and phone from the profile form', () => {
    authService.updateProfile.mockReturnValue(of({
      ...profileUser,
      email: 'updated@fishfind.info',
      cell: '555-0110',
      updated_at: '2026-03-16T00:00:00.000Z'
    }));

    component.toggleEditMode();
    component.editData.email = 'updated@fishfind.info';
    component.editData.cell = '555-0110';

    component.saveProfile();

    expect(authService.updateProfile).toHaveBeenCalledWith('updated@fishfind.info', '555-0110');
    expect(component.user?.email).toBe('updated@fishfind.info');
    expect(component.user?.cell).toBe('555-0110');
    expect(component.success).toBe('Profile updated successfully');
    expect(component.editMode).toBe(false);
  });

  it('shows backend profile update errors', () => {
    authService.updateProfile.mockReturnValue(
      throwError(() => new Error('Email already exists'))
    );

    component.toggleEditMode();
    component.editData.email = 'taken@fishfind.info';

    component.saveProfile();

    expect(component.error).toBe('Email already exists');
  });

  it('updates password when the form is valid', () => {
    authService.changePassword.mockReturnValue(of({ message: 'Password changed successfully' }));
    component.togglePasswordForm();
    component.passwordData = {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password'
    };

    component.changePassword();

    expect(authService.changePassword).toHaveBeenCalledWith('old-password', 'new-password');
    expect(component.success).toBe('Password changed successfully');
    expect(component.showPasswordForm).toBe(false);
  });
});
