import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ CommonModule, ReactiveFormsModule, RouterLink, FormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css'
})
export class ForgotPasswordComponent  {
 forgotPasswordForm: FormGroup;
 loading = false;
 submitted = false;
 errorMessage = '';
 constructor(
  private formBuilder: FormBuilder,
  private authService: AuthService,
  private router: Router
 ){
  this.forgotPasswordForm = this.formBuilder.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmNewPassword: ['',[ Validators.required, Validators.minLength(6)]]
  }, {
    validator: this.mustMatch('newPassword','confirmNewPassword')
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
get f() { return this.forgotPasswordForm.controls; }

onSubmit() {
  this.submitted = true;
  if (this.forgotPasswordForm.invalid){
    return;
  }
  this.loading = true;
  this.errorMessage = '';

  const passwordData = this.f['password'].value;
  this.authService.changePassword
}
}
