import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule]
})
export class ProfileComponent implements OnInit {
  currentUser: User | null = null;
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  twoFactorForm!: FormGroup;

  loading = {
    profile: false,
    password: false,
    enable2FA: false,
    verify2FA: false,
    disable2FA: false
  };

  message = {
    profile: { success: '', error: '' },
    password: { success: '', error: '' },
    twoFactor: { success: '', error: '' }
  };

  twoFactorState: 'inactive' | 'setup' | 'active' = 'inactive';
  qrCodeUrl: string = '';
  twoFactorSecret: string = '';

  constructor(
    private authService: AuthService,
    private fb: FormBuilder
  ) { }

  ngOnInit(): void {
    this.initForms();
    this.loadUserProfile();
  }

  initForms(): void {
    this.profileForm = this.fb.group({
      name: ['', Validators.required],
      surname: ['', Validators.required],
      email: [{ value: '', disabled: true }],
      phone_number: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, {
      validator: this.passwordMatchValidator
    });

    this.twoFactorForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern('^[0-9]{6}$')]]
    });
  }

  loadUserProfile(): void {
    this.authService.getProfile().subscribe({
      next: (user) => {
        this.currentUser = user;
        this.profileForm.patchValue({
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone_number: user.phone_number || ''
        });

        this.twoFactorState = user.two_factor_enabled ? 'active' : 'inactive';
      },
      error: (error) => {
        this.message.profile.error = 'Nu s-au putut încărca informațiile profilului.';
        console.error('Error loading profile:', error);
      }
    });
  }

  updateProfile(): void {
    if (this.profileForm.invalid) return;

    this.loading.profile = true;
    this.message.profile = { success: '', error: '' };

    const userData = {
      name: this.profileForm.value.name,
      surname: this.profileForm.value.surname,
      phone_number: this.profileForm.value.phone_number
    };

    this.authService.updateProfile(userData).subscribe({
      next: (updatedUser) => {
        this.loading.profile = false;
        this.message.profile.success = 'Profilul a fost actualizat cu succes!';
        this.currentUser = updatedUser;
      },
      error: (error) => {
        this.loading.profile = false;
        this.message.profile.error = error.message || 'A apărut o eroare la actualizarea profilului.';
      }
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) return;

    this.loading.password = true;
    this.message.password = { success: '', error: '' };

    this.authService.changePassword(
      this.passwordForm.value.currentPassword,
      this.passwordForm.value.newPassword
    ).subscribe({
      next: () => {
        this.loading.password = false;
        this.message.password.success = 'Parola a fost schimbată cu succes!';
        this.passwordForm.reset();
      },
      error: (error) => {
        this.loading.password = false;
        this.message.password.error = error.message || 'A apărut o eroare la schimbarea parolei.';
      }
    });
  }

  setupTwoFactor(): void {
    this.loading.enable2FA = true;
    this.message.twoFactor = { success: '', error: '' };

    this.authService.enableTwoFactor().subscribe({
      next: (response) => {
        this.loading.enable2FA = false;
        this.twoFactorState = 'setup';
        this.qrCodeUrl = response.qrCodeUrl;
        this.twoFactorSecret = response.secret;
      },
      error: (error) => {
        this.loading.enable2FA = false;
        this.message.twoFactor.error = error.message || 'Nu s-a putut configura autentificarea în doi pași.';
      }
    });
  }

  activateTwoFactor(): void {
    if (this.twoFactorForm.invalid) return;

    this.loading.verify2FA = true;
    this.message.twoFactor = { success: '', error: '' };

    this.authService.activateTwoFactor(this.twoFactorForm.value.code).subscribe({
      next: () => {
        this.loading.verify2FA = false;
        this.twoFactorState = 'active';
        this.message.twoFactor.success = 'Autentificarea în doi pași a fost activată cu succes!';
        this.twoFactorForm.reset();
        if (this.currentUser) {
          this.currentUser.two_factor_enabled = true;
        }
      },
      error: (error) => {
        this.loading.verify2FA = false;
        this.message.twoFactor.error = error.message || 'Codul de verificare este invalid.';
      }
    });
  }

  disableTwoFactor(): void {
    if (this.twoFactorForm.invalid) return;

    this.loading.disable2FA = true;
    this.message.twoFactor = { success: '', error: '' };

    this.authService.disableTwoFactor(this.twoFactorForm.value.code).subscribe({
      next: () => {
        this.loading.disable2FA = false;
        this.twoFactorState = 'inactive';
        this.message.twoFactor.success = 'Autentificarea în doi pași a fost dezactivată.';
        this.twoFactorForm.reset();
        if (this.currentUser) {
          this.currentUser.two_factor_enabled = false;
        }
      },
      error: (error) => {
        this.loading.disable2FA = false;
        this.message.twoFactor.error = error.message || 'Codul de verificare este invalid.';
      }
    });
  }

  cancelTwoFactorSetup(): void {
    this.twoFactorState = 'inactive';
    this.qrCodeUrl = '';
    this.twoFactorSecret = '';
    this.twoFactorForm.reset();
  }

  // Form validation helper
  passwordMatchValidator(formGroup: FormGroup) {
    const newPassword = formGroup.get('newPassword')?.value;
    const confirmPassword = formGroup.get('confirmPassword')?.value;

    if (newPassword !== confirmPassword) {
      formGroup.get('confirmPassword')?.setErrors({ mustMatch: true });
    } else {
      formGroup.get('confirmPassword')?.setErrors(null);
    }
  }
}