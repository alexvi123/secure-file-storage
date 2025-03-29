import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FileListComponent } from './file-list.component';
import { FileUploadComponent } from './file-upload.component';
import { DashboardComponent } from './dashboard.component';
import { DashboardMainComponent } from './dashboard-main.component';
import { AuthGuard } from '../../guards/auth.guard';
import { ProfileComponent } from './profile.component';

const routes: Routes = [
    {
        path: '',
        component: DashboardComponent,
        canActivate: [AuthGuard],
        children: [
            { path: '', component: DashboardMainComponent },
            { path: 'files', component: FileListComponent },
            { path: 'upload', component: FileUploadComponent },
            { path: 'profile', component: ProfileComponent }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class DashboardRoutingModule { }