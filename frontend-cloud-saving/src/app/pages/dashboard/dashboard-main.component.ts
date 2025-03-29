import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FileService } from '../../services/file.service';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-dashboard-main',
    standalone: true,
    imports: [CommonModule, RouterModule],
    template: `
    <div class="dashboard-main-content">
      <div class="content-header">
        <h1>Tablou de bord</h1>
      </div>
      
      <div *ngIf="loading" class="loading-indicator">
        <span class="spinner"></span> Încărcare date...
      </div>
      
      <div *ngIf="error" class="error-message">
        {{ error }}
      </div>
      
      <div *ngIf="!loading && !error" class="dashboard-stats">
        <div class="stats-card">
          <div class="stats-icon">
            <i class="fa fa-file"></i>
          </div>
          <div class="stats-info">
            <h3>{{ stats?.totalFiles || 0 }}</h3>
            <p>Fișiere</p>
          </div>
        </div>
        
        <div class="stats-card">
          <div class="stats-icon">
            <i class="fa fa-hdd-o"></i>
          </div>
          <div class="stats-info">
            <h3>{{ stats?.totalSizeFormatted || '0 B' }}</h3>
            <p>Spațiu utilizat</p>
          </div>
        </div>
        
        <div class="stats-card">
          <div class="stats-icon">
            <i class="fa fa-calendar"></i>
          </div>
          <div class="stats-info">
            <h3>{{ stats?.lastUpload ? (stats?.lastUpload | date:'dd/MM/yyyy') : 'Niciodată' }}</h3>
            <p>Ultima încărcare</p>
          </div>
        </div>
      </div>
      
      <div *ngIf="!loading && !error && stats?.fileTypes?.length" class="file-types-section">
        <h2>Tipuri de fișiere</h2>
        <div class="file-types-grid">
          <div *ngFor="let fileType of stats?.fileTypes" class="file-type-card">
            <div class="file-type-icon">
              <i class="fa" [ngClass]="{
                'fa-image': fileType.type === 'Imagini',
                'fa-file-video-o': fileType.type === 'Video',
                'fa-file-audio-o': fileType.type === 'Audio',
                'fa-file-pdf-o': fileType.type === 'PDF',
                'fa-file-word-o': fileType.type === 'Documente Word',
                'fa-file-excel-o': fileType.type === 'Foi de calcul',
                'fa-file-text-o': fileType.type === 'Text',
                'fa-file-o': fileType.type === 'Altele'
              }"></i>
            </div>
            <div class="file-type-info">
              <h4>{{ fileType.type }}</h4>
              <p>{{ fileType.count }} fișiere ({{ fileType.sizeFormatted }})</p>
            </div>
          </div>
        </div>
      </div>
      
      <div *ngIf="!loading && !error && stats?.monthlyActivity?.length" class="activity-section">
        <h2>Activitate lunară</h2>
        <div class="activity-chart">
          <div *ngFor="let month of stats?.monthlyActivity" class="activity-bar">
            <div class="bar-value" [style.height.%]="getBarHeight(month.count)"></div>
            <div class="bar-label">{{ month.month }}</div>
          </div>
        </div>
      </div>
      
      <div class="upload-cta">
        <a routerLink="/dashboard/upload" class="btn btn-primary">
          <i class="fa fa-upload"></i> Încarcă fișiere noi
        </a>
      </div>
    </div>
  `,
    styleUrls: ['./dashboard.component.css'] // Poți folosi stilurile existente
})
export class DashboardMainComponent implements OnInit {
    stats: any = null;
    loading = true;
    error: string | null = null;

    constructor(
        private fileService: FileService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.loadStats();
    }

    loadStats(): void {
        this.fileService.getUserStats().subscribe({
            next: (stats) => {
                this.stats = stats;
                this.loading = false;
            },
            error: (error) => {
                this.error = error.message || 'Nu s-au putut încărca statisticile';
                this.loading = false;
            }
        });
    }

    getBarHeight(count: number): number {
        if (!this.stats || !this.stats.monthlyActivity || this.stats.monthlyActivity.length === 0) {
            return 0;
        }

        const maxCount = Math.max(...this.stats.monthlyActivity.map((item: any) => item.count));
        if (maxCount === 0) return 0;

        return (count / maxCount) * 100;
    }
}