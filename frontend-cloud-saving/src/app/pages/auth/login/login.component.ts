import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink]
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  loading = false;
  submitted = false;
  errorMessage = '';
  successMessage = '';
  returnUrl: string = '/dashboard';

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    // Verifică dacă utilizatorul a fost redirecționat de la pagina de înregistrare
    const registered = this.route.snapshot.queryParams['registered'];
    if (registered) {
      this.successMessage = 'Înregistrare reușită. Acum vă puteți autentifica.';
    }

    // Obține URL-ul de returnare din query params sau folosește valoarea implicită
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

  }

  // Getter pentru acces la câmpurile formularului
  get f() { return this.loginForm.controls; }

  onSubmit() {
    this.submitted = true;

    // Nu continua dacă formularul este invalid
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.f['email'].value, this.f['password'].value)
      .subscribe({
        next: (response) => {
          // Dacă este necesară autentificarea cu doi factori
          if (response.require2FA) {
            console.log('Temporary token received:', response.tempToken);
            console.log('Raspunsul: ', response);
            this.router.navigate(['/auth/two-factor'], {
              queryParams: {
                tempToken: response.tempToken,
                returnUrl: this.returnUrl
              }
            });
          } else {
            // Verifică rolul utilizatorului pentru redirect
            console.log('Login successful, user data:', response.user);

            // Verifică dacă utilizatorul este admin
            if (response.user && response.user.role === 'admin') {
              console.log('Admin user detected, redirecting to /admin');
              this.router.navigate(['/admin']);
            } else {
              console.log('Regular user, redirecting to:', this.returnUrl);
              // Pentru utilizatorii normali, folosește returnUrl implicit
              this.router.navigate([this.returnUrl]);
            }
          }
        },
        error: error => {
          this.errorMessage = error.message;
          this.loading = false;
        }
      });
  }
}