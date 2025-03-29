// src/app/pages/dashboard/dashboard.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { FileService, FileStats } from '../../services/file.service';
import { AuthService, User } from '../../services/auth.service';
import { MonthLabelPipe } from '../../pipes/month-label.pipe';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MonthLabelPipe, RouterModule]
})
export class DashboardComponent implements OnInit {
  currentUser: User | null = null;
  stats: FileStats | null = null;
  loading = true;
  error = '';

  constructor(
    private fileService: FileService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
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

  logout(): void {
    this.authService.logout();
  }
  getBarHeight(count: number): number {
    if (!this.stats || !this.stats.monthlyActivity || this.stats.monthlyActivity.length === 0) {
      return 0;
    }

    const maxCount = Math.max(...this.stats.monthlyActivity.map(item => item.count));
    if (maxCount === 0) return 0;

    return (count / maxCount) * 100;
  }

}