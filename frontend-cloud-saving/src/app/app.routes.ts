import { Routes } from '@angular/router';
import { RegisterComponent } from './pages/auth/register/register.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { TwoFactorComponent } from './pages/auth/two-factor/two-factor.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AuthGuard } from './guards/auth.guard';
import { FileListComponent } from './pages/dashboard/file-list.component';
import { FileUploadComponent } from './pages/dashboard/file-upload.component';
import { AdminComponent } from './pages/admin/admin.component';
import { AdminGuard } from './guards/admin.guard';
import { ForgotPasswordComponent } from './pages/auth/forgot-password/forgot-password.component';

export const routes: Routes = [
    {
        path: 'auth',
        children: [
            { path: 'register', component: RegisterComponent },
            { path: 'login', component: LoginComponent },
            { path: 'two-factor', component: TwoFactorComponent },
            { path: 'forgot-password', component: ForgotPasswordComponent }
        ]
    },
    {
        path: 'admin',
        component: AdminComponent,
        canActivate: [AuthGuard, AdminGuard]
    },
    {
        path: 'dashboard',
        loadChildren: () => import('./pages/dashboard/dashboard-routing.module').then(m => m.DashboardRoutingModule)
    },
    { path: '', redirectTo: 'auth/login', pathMatch: 'full' }
];