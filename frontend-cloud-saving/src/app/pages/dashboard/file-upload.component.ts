// src/app/pages/dashboard/file-upload.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FileService } from '../../services/file.service';
import { HttpEventType, HttpResponse } from '@angular/common/http';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss']
})
export class FileUploadComponent implements OnInit {
  selectedFiles: File[] = [];
  uploadProgress: number | null = null;
  isUploading = false;
  error: string | null = null;
  successMessage: string | null = null;

  constructor(
    private fileService: FileService,
    private router: Router
  ) { }

  ngOnInit(): void { }

  onFileSelected(event: any): void {
    const files: FileList = event.target.files;
    this.addFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.add('dragover');
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.remove('dragover');
  }

  onDropFiles(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.remove('dragover');

    const files = event.dataTransfer?.files;
    if (files) {
      this.addFiles(files);
    }
  }

  addFiles(files: FileList): void {
    // Limită: Maximum 10 fișiere
    const maxFiles = 10;
    const maxFileSize = 1024 * 1024 * 500; // 500 MB

    const validFiles = Array.from(files).filter(file => {
      const isValidSize = file.size <= maxFileSize;
      if (!isValidSize) {
        this.error = `Fișierul ${file.name} depășește limita de 500 MB`;
      }
      return isValidSize;
    });

    const newFiles = validFiles.slice(0, maxFiles - this.selectedFiles.length);
    this.selectedFiles = [...this.selectedFiles, ...newFiles];

    // Reset error and progress when new files are added
    this.error = null;
    this.uploadProgress = null;
  }

  removeFile(fileToRemove: File): void {
    this.selectedFiles = this.selectedFiles.filter(file => file !== fileToRemove);
  }

  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  uploadFiles(): void {
    console.log('Buton de upload apăsat!'); // Adaugă această linie
    console.log('Fișiere selectate:', this.selectedFiles);
    if (this.selectedFiles.length === 0) {
      this.error = 'Nu ați selectat niciun fișier pentru încărcare';
      return;
    }

    // For now, let's handle only the first file
    const fileToUpload = this.selectedFiles[0];
    this.isUploading = true;
    this.uploadProgress = 0;
    this.error = null;
    this.successMessage = null;

    this.fileService.uploadFile(fileToUpload).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress = Math.round(100 * event.loaded / event.total);
        } else if (event instanceof HttpResponse) {
          const response = event.body;
          this.successMessage = `Fișierul ${fileToUpload.name} a fost încărcat cu succes`;
          this.isUploading = false;

          // Remove the uploaded file from the selection
          this.removeFile(fileToUpload);

          // Redirect to file list after a short delay
          setTimeout(() => {
            this.router.navigate(['/dashboard/files']);
          }, 2000);
        }
      },
      error: (err) => {
        this.isUploading = false;
        this.error = `Eroare la încărcarea fișierului: ${err.message || 'A apărut o eroare necunoscută'}`;
        console.error('Upload error:', err);
      },
      complete: () => {
        this.isUploading = false;
      }
    });
  }
}