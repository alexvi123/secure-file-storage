import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { response } from 'express';
@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, FormsModule]
})

export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  loading = false;
  submitted = false;
  errorMessage = '';

  // 2FA setup
  qrCodeUrl: string | null = null;
  secret2FA: string | null = null;
  showTwoFactorSetup = false;
  twoFactorCode = '';
  twoFactorEnabled = false;
  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      name: ['', Validators.required],
      surname: ['', Validators.required],
      phone_number: [''],
      confirmPassword: ['', Validators.required]
    }, {
      validator: this.mustMatch('password', 'confirmPassword')
    });
  }

  ngOnInit(): void {
    // Dacă utilizatorul este deja autentificat, redirecteză către dashboard
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  // Getter pentru acces ușor la câmpurile formularului
  get f() { return this.registerForm.controls; }

  onSubmit() {
    this.submitted = true;

    // Nu continua dacă formularul este invalid
    if (this.registerForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const userData = {
      email: this.f['email'].value,
      password: this.f['password'].value,
      name: this.f['name'].value,
      surname: this.f['surname'].value,
      phone_number: this.f['phone_number'].value
    };

    this.authService.register(userData)
      .subscribe({
        next: () => {
          this.autoLogin(userData.email, userData.password);
        },
        error: error => {
          this.errorMessage = error.message;
          this.loading = false;
        }
      });
  }

  mustMatch(controlName: string, matchingControlName: string) {
    return (formGroup: FormGroup) => {
      const control = formGroup.controls[controlName];
      const matchingControl = formGroup.controls[matchingControlName];

      if (matchingControl.errors && !matchingControl.errors['mustMatch']) {
        return;
      }

      if (control.value !== matchingControl.value) {
        matchingControl.setErrors({ mustMatch: true });
      } else {
        matchingControl.setErrors(null);
      }
    };
  }
  private autoLogin(email: string, password: string) {
    this.authService.login(email, password)
      .subscribe({
        next: (response) => {
          this.loading = false;
          this.setupTwoFactor();
        },
        error: error => {
          this.errorMessage = "Înregistrarea a reușit, dar autentificarea automată a eșuat. Vă rugăm să vă autentificați manual."
          this.loading = false;
          this.router.navigate(['/auth/login'], { queryParams: { registered: true } });
        }
      });
  }
  setupTwoFactor() {
    this.loading = true;

    this.authService.enableTwoFactor()
      .subscribe({
        next: (response) => {
          this.qrCodeUrl = response.qrCodeUrll
          this.secret2FA = response.secret;
          this.showTwoFactorSetup = true;
          this.loading = false;
        },
        error: error => {
          this.errorMessage = "Nu s-a putut configura autentificarea în doi pași. O puteți configura manual mai târziu din profilul dvs."
          this.loading = false;
          this.router.navigate(['/dashboard']);
        }
      });
  }

  activateTwoFactor() {
    if (!this.twoFactorCode || this.twoFactorCode.length !== 6) {
      this.errorMessage = "Vă rugăm să introduceți un cod valid de 6 cifre din aplicația de autentificare.";
      return;
    }
    this.loading = true;
    this.authService.activateTwoFactor(this.twoFactorCode)
      .subscribe({
        next: (response) => {
          this.twoFactorEnabled = true;
          this.loading = false;
          setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 2000);
        },
        error: error => {
          this.errorMessage = error.message || "Cod de verificare invalid. Vă rugăm încercați din nou.";
          this.loading = false;
        }
      });
  }
  skipTwoFactorSetup() {
    // Navighează către dashboard fără configurarea 2FA
    this.router.navigate(['/dashboard']);
  }
}