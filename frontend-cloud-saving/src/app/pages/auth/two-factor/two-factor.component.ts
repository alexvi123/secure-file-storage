// src/app/pages/auth/two-factor/two-factor.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-two-factor',
  templateUrl: './two-factor.component.html',
  styleUrls: ['./two-factor.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink]
})
export class TwoFactorComponent implements OnInit {
  twoFactorForm: FormGroup;
  loading = false;
  submitted = false;
  errorMessage = '';
  tempToken: string = '';
  returnUrl: string = '/dashboard';

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.twoFactorForm = this.formBuilder.group({
      code: ['', [Validators.required, Validators.pattern('^[0-9]{6}$')]]
    });
  }

  ngOnInit(): void {
    // Obține token-ul temporar și URL-ul de returnare din query params
    this.tempToken = this.route.snapshot.queryParams['tempToken'];
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    // Verifică dacă există un token temporar
    if (!this.tempToken) {
      this.router.navigate(['/auth/login']);
    }
  }

  // Getter pentru acces ușor la câmpurile formularului
  get f() { return this.twoFactorForm.controls; }

  onSubmit() {
    this.submitted = true;

    // Nu continua dacă formularul este invalid
    if (this.twoFactorForm.invalid) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.verify2FA(this.f['code'].value, this.tempToken)
      .subscribe({
        next: () => {
          // Autentificare 2FA reușită, redirecționează către pagina de returnare
          this.router.navigate([this.returnUrl]);
        },
        error: error => {
          this.errorMessage = error.message || 'Cod invalid. Verificați aplicația autentificator și încercați din nou.';
          this.loading = false;
        }
      });
  }

  // Funcție pentru a permite doar cifre în input
  onKeyDown(event: KeyboardEvent): boolean {
    // Permite: backspace, delete, tab și escape
    if ([46, 8, 9, 27].indexOf(event.keyCode) !== -1 ||
      // Permite: Ctrl+A
      (event.keyCode === 65 && event.ctrlKey === true) ||
      // Permite: home, end, left, right
      (event.keyCode >= 35 && event.keyCode <= 39)) {
      return true;
    }
    // Asigură-te că este o cifră și că nu sunt mai mult de 6 cifre
    if ((event.shiftKey || (event.keyCode < 48 || event.keyCode > 57)) &&
      (event.keyCode < 96 || event.keyCode > 105) ||
      (this.f['code'].value?.length >= 6 && event.keyCode !== 8)) {
      event.preventDefault();
      return false;
    }
    return true;
  }
}