// src/app/pages/admin/admin.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { AdminService, AdminUser, AdminFile, Container, UsersResponse, ContainerStats, SystemStats } from '../../services/admin.service';


interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class AdminComponent implements OnInit {
  currentUser: User | null = null;
  activeSection: string = 'overview';
  loading = false;

  // Data properties
  systemStats: SystemStats | null = null;
  containerStats: ContainerStats | null = null;
  containers: Container[] = [];
  allUsers: AdminUser[] = [];
  filteredUsers: AdminUser[] = [];
  allFiles: AdminFile[] = [];

  // Filter properties
  userSearchTerm = '';
  selectedUserRole = '';

  // Modal properties
  showModal = false;
  modalTitle = '';
  modalContent = '';
  modalAction: (() => void) | null = null;
  modalActionText = '';

  // Toast notifications
  toasts: Toast[] = [];
  private toastIdCounter = 0;

  // System properties
  totalStorageFormatted = '20 GB'; // Default, should be fetched from API
  systemUptime = '';
  lastSyncTime: string = new Date().toISOString();

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;

    // Verify admin access
    if (!this.currentUser || this.currentUser.role !== 'admin') {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loadSystemStats();
    // this.loadContainerStats();
    this.loadUsers();
  }

  setActiveSection(section: string): void {
    this.activeSection = section;

    // Update active menu item styling
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    // Load section-specific data
    switch (section) {
      case 'users':
        this.loadUsers();
        break;
      case 'files':
        this.loadFiles();
        break;
      case 'containers':
        this.loadContainers();
        break;
      case 'storage':
        this.loadStorageData();
        break;
    }
  }

  // Data loading methods
  loadSystemStats(): void {
    this.loading = true;
    this.adminService.getSystemStats().subscribe({
      next: (stats) => {
        this.systemStats = stats;
        this.loading = false;
      },
      error: (error) => {
        this.showToast('error', 'Eroare la încărcarea statisticilor de sistem');
        this.loading = false;
      }
    });
  }

  loadContainerStats(): void {
    this.adminService.getContainerStats().subscribe({
      next: (stats) => {
        console.log('Container stats:', stats);
        this.containerStats = stats;
      },
      error: (error) => {
        this.showToast('error', 'Eroare la încărcarea statisticilor containerelor');
      }
    });
  }
  loadUsers(): void {
    this.adminService.getAllUsers().subscribe({
      next: (response) => {
        console.log('Users response:', response);
        this.allUsers = response.users;
        this.filteredUsers = response.users;
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.showToast('error', 'Eroare la încărcarea utilizatorilor');
      }
    });
  }
  loadFiles(): void {
    this.adminService.getAllFiles().subscribe({
      next: (files) => {
        this.allFiles = files;
      },
      error: (error) => {
        this.showToast('error', 'Eroare la încărcarea fișierelor');
      }
    });
  }

  loadContainers(): void {
    console.log('Loading containers...');
    this.adminService.getAllContainers().subscribe({
      next: (response: any) => {
        console.log('Containers response:', response);

        if (response.containers && Array.isArray(response.containers)) {
          this.containers = response.containers;
        } else {
          this.containers = [];
        }
        console.log('Container object received:', this.containers[0]);

        console.log('Final containers:', this.containers);
      },
      error: (error) => {
        console.error('Error loading containers:', error);
        this.showToast('error', 'Eroare la încărcarea containerelor');
      }
    });
  }




  loadStorageData(): void {
    this.loadContainers();
    this.adminService.getStorageReport().subscribe({
      next: (report) => {
      },
      error: (error) => {
        this.showToast('error', 'Eroare la încărcarea datelor de stocare');
      }
    });
  }

  // Filter methods
  filterUsers(): void {
    this.filteredUsers = this.allUsers.filter(user => {
      const matchesSearch = !this.userSearchTerm ||
        user.name.toLowerCase().includes(this.userSearchTerm.toLowerCase()) ||
        user.surname.toLowerCase().includes(this.userSearchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(this.userSearchTerm.toLowerCase());

      const matchesRole = !this.selectedUserRole || user.role === this.selectedUserRole;

      return matchesSearch && matchesRole;
    });
  }

  deleteUser(user: AdminUser): void {
    if (user.role === 'admin' && user.id === this.currentUser?.id) {
      this.showToast('error', 'Nu te poți șterge pe tine însuți');
      return;
    }

    this.modalTitle = 'Confirmare ștergere utilizator';
    this.modalContent = `
      <p>Ești sigur că vrei să ștergi utilizatorul <strong>${user.name} ${user.surname}</strong>?</p>
      <p class="text-danger">Această acțiune va șterge și toate fișierele utilizatorului și nu poate fi anulată.</p>
    `;
    this.modalActionText = 'Șterge utilizator';
    this.modalAction = () => {
      this.adminService.deleteUser(user.id).subscribe({
        next: () => {
          this.showToast('success', 'Utilizatorul a fost șters cu succes');
          this.loadUsers();
          this.closeModal();
        },
        error: (error) => {
          this.showToast('error', 'Eroare la ștergerea utilizatorului');
        }
      });
    };
    this.showModal = true;
  }

  // File management methods
  viewFileDetails(file: AdminFile): void {
    this.modalTitle = `Detalii fișier: ${file.filename}`;
    this.modalContent = `
      <div class="file-details">
        <p><strong>ID:</strong> ${file.id}</p>
        <p><strong>Proprietar:</strong> ${file.userName}</p>
        <p><strong>Dimensiune:</strong> ${file.sizeFormatted}</p>
        <p><strong>Tip:</strong> ${file.mimeType}</p>
        <p><strong>Fragmente:</strong> ${file.fragmentCount}</p>
        <p><strong>Încărcat la:</strong> ${this.formatDate(file.uploadedAt)}</p>
      </div>
    `;
    this.modalAction = null;
    this.showModal = true;
  }




  restartContainer(container: Container): void {
    this.modalTitle = `Restart Container ${container.id}`;
    this.modalContent = `
      <p>Ești sigur că vrei să repornești Container ${container.id}?</p>
      <p class="text-warning">Această operațiune poate întrerupe temporar serviciile.</p>
    `;
    this.modalActionText = 'Repornește';
    this.modalAction = () => {
      this.adminService.restartContainer(container.id).subscribe({
        next: () => {
          this.showToast('success', `Container ${container.id} a fost repornit cu succes`);
          this.loadContainers();
          this.closeModal();
        },
        error: (error) => {
          this.showToast('error', 'Eroare la repornirea containerului');
        }
      });
    };
    this.showModal = true;
  }


  // System management methods
  rebalanceContainers(): void {
    this.adminService.rebalanceContainers().subscribe({
      next: () => {
        this.showToast('success', 'Rebalansarea containerelor a fost finalizată cu succes');
        this.loadContainers();
        this.loadContainerStats();
      },
      error: (error) => {
        this.showToast('error', 'Eroare la rebalansarea containerelor');
      }
    });
  }

  syncStorage(): void {
    this.adminService.syncStorage().subscribe({
      next: () => {
        this.showToast('success', 'Sincronizarea storage-ului a fost finalizată');
        this.loadContainers();
        this.loadSystemStats();
        this.lastSyncTime = new Date().toISOString();
      },
      error: (error) => {
        this.showToast('error', 'Eroare la sincronizarea storage-ului');
      }
    });
  }

  cleanupOrphanedFiles(): void {
    this.adminService.cleanupOrphanedFiles().subscribe({
      next: (result) => {
        this.showToast('success', `Au fost curățate ${result.deletedCount} fișiere orfane`);
        this.loadFiles();
        this.loadSystemStats();
      },
      error: (error) => {
        this.showToast('error', 'Eroare la curățarea fișierelor orfane');
      }
    });
  }






  // Maintenance methods
  cleanupTempFiles(): void {
    this.adminService.cleanupTempFiles().subscribe({
      next: (result) => {
        this.showToast('success', `Au fost curățate ${result.deletedCount} fișiere temporare`);
      },
      error: (error) => {
        this.showToast('error', 'Eroare la curățarea fișierelor temporare');
      }
    });
  }

  optimizeDatabase(): void {
    this.modalTitle = 'Confirmare optimizare bază de date';
    this.modalContent = `
      <p>Ești sigur că vrei să optimizezi baza de date?</p>
      <p class="text-warning">Această operațiune poate dura câteva minute și poate afecta performanța temporar.</p>
    `;
    this.modalActionText = 'Optimizează';
    this.modalAction = () => {
      this.adminService.optimizeDatabase().subscribe({
        next: () => {
          this.showToast('success', 'Baza de date a fost optimizată cu succes');
          this.closeModal();
        },
        error: (error) => {
          this.showToast('error', 'Eroare la optimizarea bazei de date');
        }
      });
    };
    this.showModal = true;
  }

  createBackup(): void {
    this.adminService.createBackup().subscribe({
      next: (data) => {
        this.downloadFile(data, `backup-${new Date().toISOString().split('T')[0]}.sql`);
        this.showToast('success', 'Backup-ul a fost creat cu succes');
      },
      error: (error) => {
        this.showToast('error', 'Eroare la crearea backup-ului');
      }
    });
  }

  checkSystemHealth(): void {
    this.adminService.checkSystemHealth().subscribe({
      next: (health) => {
        this.modalTitle = 'Starea sănătății sistemului';
        this.modalContent = `
          <div class="health-report">
            <p><strong>Status general:</strong> <span class="status-badge ${health.overall}">${health.overall}</span></p>
            <p><strong>Baza de date:</strong> <span class="status-badge ${health.database}">${health.database}</span></p>
            <p><strong>Containere:</strong> <span class="status-badge ${health.containers}">${health.containers}</span></p>
            <p><strong>Stocare:</strong> <span class="status-badge ${health.storage}">${health.storage}</span></p>
            ${health.issues?.length ? `
              <div class="health-issues">
                <h4>Probleme detectate:</h4>
                <ul>
                  ${health.issues.map(issue => `<li>${issue}</li>`).join('')}
                </ul>
              </div>
            ` : '<p class="text-success">Nu au fost detectate probleme.</p>'}
          </div>
        `;
        this.modalAction = null;
        this.showModal = true;
      },
      error: (error) => {
        this.showToast('error', 'Eroare la verificarea sănătății sistemului');
      }
    });
  }

  // Refresh methods
  refreshUsers(): void {
    this.loadUsers();
    this.showToast('info', 'Lista utilizatorilor a fost actualizată');
  }

  refreshFiles(): void {
    this.loadFiles();
    this.showToast('info', 'Lista fișierelor a fost actualizată');
  }

  refreshContainers(): void {
    this.loadContainers();
    this.showToast('info', 'Lista containerelor a fost actualizată');
  }

  // Utility methods
  getStorageUsagePercentage(): number {
    if (!this.systemStats) return 0;
    const totalBytes = 2 * 1024 * 1024 * 1024 * 1024; // 2TB in bytes
    const usedBytes = this.parseSize(this.systemStats.totalSizeFormatted);
    return Math.round((usedBytes / totalBytes) * 100);
  }

  getAvailableStorageFormatted(): string {
    if (!this.systemStats) return this.totalStorageFormatted;
    const totalBytes = 20 * 1024 * 1024 * 1024; // 20GB in bytes
    const usedBytes = this.parseSize(this.systemStats.totalSizeFormatted);
    const availableBytes = totalBytes - usedBytes;
    return this.formatBytes(availableBytes);
  }

  getContainerUsagePercentage(storageUsed: number): number {
    const containerTotal = 100 * 1024 * 1024 * 1024; // 100GB per container
    return Math.round((storageUsed / containerTotal) * 100);
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'fa-file-image-o';
    if (mimeType.startsWith('video/')) return 'fa-file-video-o';
    if (mimeType.startsWith('audio/')) return 'fa-file-audio-o';
    if (mimeType === 'application/pdf') return 'fa-file-pdf-o';
    if (mimeType.includes('word')) return 'fa-file-word-o';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel-o';
    return 'fa-file-o';
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Necunoscut';
    return new Date(dateString).toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  parseSize(sizeString: string): number {
    if (!sizeString) return 0;
    const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match) return 0;

    const size = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: { [key: string]: number } = { 'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3, 'TB': 1024 ** 4 };
    return size * (multipliers[unit] || 1);
  }

  downloadFile(data: any, filename: string): void {
    const blob = new Blob([data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // Modal methods
  closeModal(): void {
    this.showModal = false;
    this.modalAction = null;
  }

  executeModalAction(): void {
    if (this.modalAction) {
      this.modalAction();
    }
  }
  // Helper functions
  trackByUserId(index: number, user: any): number {
    return user.id;
  }

  getStoragePercentage(storageUsed: number | undefined): number {
    if (!storageUsed) return 0;
    const maxStorage = 5 * 1024 * 1024 * 1024;
    return Math.min((storageUsed / maxStorage) * 100, 100);
  }
  // Toast methods
  showToast(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
    const toast: Toast = {
      id: this.toastIdCounter++,
      type,
      message
    };

    this.toasts.push(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      this.removeToast(toast);
    }, 5000);
  }

  removeToast(toast: Toast): void {
    this.toasts = this.toasts.filter(t => t.id !== toast.id);
  }

  getToastIcon(type: string): string {
    const icons: { [key: string]: string } = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    return icons[type] || 'fa-info-circle';
  }

  // Navigation methods
  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.authService.logout();
  }
}