// src/app/services/file.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams, HttpRequest } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

// Folosim URL-ul API direct (sau puteți importa din config.ts)
const API_URL = 'http://localhost:5000/api';

export interface FileMetadata {
    id: number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
    updated_at?: string;
}

export interface PaginatedResponse<T> {
    files: T[];
    pagination: {
        currentPage: number;
        totalPages: number;
        limit: number;
        totalFiles: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
}

export interface FileUploadResponse {
    message: string;
    fileId: number;
    fileName: string;
    size: number;
    fragmentCount: number;
}

export interface FileStats {
    totalFiles: number;
    totalSize: number;
    totalSizeFormatted: string;
    lastUpload: string;
    fileTypes: {
        type: string;
        count: number;
        size: number;
        sizeFormatted: string;
    }[];
    monthlyActivity: {
        month: string;
        count: number;
        size: number;
        sizeFormatted: string;
    }[];
}

@Injectable({
    providedIn: 'root'
})
export class FileService {
    private apiUrl = `${API_URL}/files`;

    constructor(private http: HttpClient) { }

    /**
     * Obține lista de fișiere ale utilizatorului
     */
    getUserFiles(page: number = 1, limit: number = 10): Observable<PaginatedResponse<FileMetadata>> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('limit', limit.toString());

        return this.http.get<PaginatedResponse<FileMetadata>>(this.apiUrl, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Caută fișiere după nume
     */
    searchFiles(query: string, page: number = 1, limit: number = 10): Observable<PaginatedResponse<FileMetadata>> {
        const params = new HttpParams()
            .set('query', query)
            .set('page', page.toString())
            .set('limit', limit.toString());

        return this.http.get<PaginatedResponse<FileMetadata>>(`${this.apiUrl}/search`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține detalii despre un fișier
     */
    getFileDetails(fileId: number): Observable<FileMetadata> {
        return this.http.get<FileMetadata>(`${this.apiUrl}/${fileId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Încarcă un fișier
     */
    uploadFile(file: File): Observable<HttpEvent<FileUploadResponse>> {
        const formData = new FormData();
        formData.append('file', file);

        const request = new HttpRequest('POST', `${this.apiUrl}/upload`, formData, {
            reportProgress: true
        });

        return this.http.request<FileUploadResponse>(request)
            .pipe(catchError(this.handleError));
    }

    /**
     * Descarcă un fișier
     */
    downloadFile(fileId: number): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/${fileId}/download`, {
            responseType: 'blob'
        }).pipe(catchError(this.handleError));
    }

    /**
     * Șterge un fișier
     */
    deleteFile(fileId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${fileId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Redenumește un fișier
     */
    renameFile(fileId: number, newName: string): Observable<FileMetadata> {
        return this.http.put<FileMetadata>(`${this.apiUrl}/${fileId}`, { newName })
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține statistici despre fișierele utilizatorului
     */
    getUserStats(): Observable<FileStats> {
        return this.http.get<FileStats>(`${this.apiUrl}/stats`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Verifică integritatea unui fișier
     */
    verifyFileIntegrity(fileId: number): Observable<any> {
        return this.http.get(`${this.apiUrl}/${fileId}/integrity`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Repară un fișier
     */
    repairFile(fileId: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/${fileId}/repair`, {})
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține URL-ul pentru previzualizare fișier (pentru imagini, PDF-uri, etc.)
     */
    getPreviewUrl(fileId: number): string {
        return `${this.apiUrl}/${fileId}/download`;
    }

    /**
     * Gestionează erorile HTTP
     */
    private handleError(error: any): Observable<never> {
        let errorMessage = 'A apărut o eroare';
        if (error.error instanceof ErrorEvent) {
            // Eroare client-side
            errorMessage = `Eroare: ${error.error.message}`;
        } else {
            // Eroare backend
            errorMessage = error.error?.message || `Cod: ${error.status}, Mesaj: ${error.message}`;
        }
        console.error(errorMessage);
        return throwError(() => new Error(errorMessage));
    }
}