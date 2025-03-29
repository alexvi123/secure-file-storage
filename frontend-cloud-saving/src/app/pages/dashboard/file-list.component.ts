import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FileService, FileMetadata } from '../../services/file.service';

@Component({
  selector: 'app-file-list',
  templateUrl: './file-list.component.html',
  styleUrls: ['./file-list.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class FileListComponent implements OnInit {
  files: FileMetadata[] = [];
  selectedFiles: Set<number> = new Set();
  currentPage = 1;
  totalPages = 1;
  loading = true;
  error: string | null = null;

  constructor(private fileService: FileService) { }

  ngOnInit(): void {
    this.loadFiles();
  }

  loadFiles(): void {
    this.loading = true;
    this.fileService.getUserFiles(this.currentPage).subscribe({
      next: (response) => {
        this.files = response.files;
        this.totalPages = response.pagination.totalPages || 1;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Eroare la încărcarea fișierelor';
        this.loading = false;
      }
    });
  }

  toggleSelectAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    const checked = target.checked;

    if (checked) {
      this.files.forEach(file => this.selectedFiles.add(file.id));
    } else {
      this.selectedFiles.clear();
    }
  }

  toggleFileSelection(fileId: number): void {
    if (this.selectedFiles.has(fileId)) {
      this.selectedFiles.delete(fileId);
    } else {
      this.selectedFiles.add(fileId);
    }
  }

  isFileSelected(fileId: number): boolean {
    return this.selectedFiles.has(fileId);
  }

  downloadFile(file: FileMetadata): void {
    this.fileService.downloadFile(file.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.original_name;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Eroare la descărcare:', err);
        // Eventual, afișează un mesaj de eroare
      }
    });
  }

  deleteFile(fileId: number): void {
    if (!confirm('Sigur doriți să ștergeți acest fișier?')) return;

    this.fileService.deleteFile(fileId).subscribe({
      next: () => {
        this.loadFiles();
        this.selectedFiles.delete(fileId);
      },
      error: (err) => {
        console.error('Eroare la ștergere:', err);
        // Eventual, afișează un mesaj de eroare
      }
    });
  }

  performBulkAction(action: 'delete'): void {
    if (this.selectedFiles.size === 0) return;

    if (action === 'delete') {
      if (!confirm(`Sigur doriți să ștergeți ${this.selectedFiles.size} fișiere?`)) return;

      const deletePromises = Array.from(this.selectedFiles).map(fileId =>
        this.fileService.deleteFile(fileId).toPromise()
      );

      Promise.all(deletePromises)
        .then(() => {
          this.loadFiles();
          this.selectedFiles.clear();
        })
        .catch(err => {
          console.error('Eroare la ștergere în masă:', err);
          // Eventual, afișează un mesaj de eroare
        });
    }
  }

  changePage(newPage: number): void {
    if (newPage > 0 && newPage <= this.totalPages) {
      this.currentPage = newPage;
      this.loadFiles();
    }
  }

  formatFileSize(sizeBytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = sizeBytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
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
}