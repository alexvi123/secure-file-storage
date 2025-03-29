// src/app/services/admin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { User } from './auth.service';

// URL-ul API
const API_URL = '/api';

export interface PaginatedUsersResponse {
    users: User[];
    pagination: {
        currentPage: number;
        totalPages: number;
        limit: number;
        totalUsers: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
}

export interface SystemStats {
    users: {
        total: number;
    };
    files: {
        total: number;
        totalSize: number;
        totalSizeFormatted: string;
    };
    fragments: {
        total: number;
    };
    containers: {
        total: number;
        active: number;
        inactive: number;
    };
    monthlyActivity: {
        month: string;
        count: number;
        size: number;
        sizeFormatted: string;
    }[];
    fileTypes: {
        type: string;
        count: number;
        size: number;
        sizeFormatted: string;
    }[];
}

export interface ContainerStatus {
    id: number;
    name: string;
    status: 'active' | 'inactive';
    health: 'healthy' | 'unhealthy' | 'unknown';
    fragmentCount: number;
    totalSize: number;
    totalSizeFormatted: string;
    lastChecked: string;
}

export interface ContainerDetails {
    container: {
        id: number;
        name: string;
        status: 'active' | 'inactive';
        health: 'healthy' | 'unhealthy' | 'unknown';
        storageStats: {
            fragmentCount: number;
            totalSize: number;
            filesCount: number;
        };
        fragmentsInfo: {
            id: number;
            fileId: number;
            fileName: string;
            fragmentIndex: number;
            size: number;
        }[];
        totalFragments: number;
    };
}

export interface FragmentDistribution {
    distribution: {
        containerId: number;
        name: string;
        status: string;
        health: string;
        fragmentCount: number;
        totalSize: number;
        totalSizeFormatted: string;
    }[];
    summary: {
        totalFragments: number;
        totalSize: number;
        totalSizeFormatted: string;
        avgFragmentsPerContainer: number;
        mostLoadedContainer: number | null;
        leastLoadedContainer: number | null;
    };
}

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private apiUrl = `${API_URL}/admin`;

    constructor(private http: HttpClient) { }

    // GESTIONARE UTILIZATORI

    /**
     * Obține toți utilizatorii cu paginare
     */
    getAllUsers(page: number = 1, limit: number = 10): Observable<PaginatedUsersResponse> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('limit', limit.toString());

        return this.http.get<PaginatedUsersResponse>(`${this.apiUrl}/users`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține detalii despre un utilizator
     */
    getUserById(userId: number): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/users/${userId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Actualizează informațiile unui utilizator
     */
    updateUser(userId: number, userData: Partial<User>): Observable<User> {
        return this.http.put<User>(`${this.apiUrl}/users/${userId}`, userData)
            .pipe(catchError(this.handleError));
    }

    /**
     * Șterge un utilizator
     */
    deleteUser(userId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/users/${userId}`)
            .pipe(catchError(this.handleError));
    }

    // GESTIONARE FIȘIERE

    /**
     * Obține toate fișierele din sistem
     */
    getAllFiles(page: number = 1, limit: number = 10): Observable<any> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('limit', limit.toString());

        return this.http.get(`${this.apiUrl}/files`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Șterge un fișier
     */
    deleteFile(fileId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/files/${fileId}`)
            .pipe(catchError(this.handleError));
    }

    // GESTIONARE CONTAINERE

    /**
     * Obține statusul tuturor containerelor
     */
    getAllContainers(): Observable<ContainerStatus[]> {
        return this.http.get<ContainerStatus[]>(`${this.apiUrl}/containers`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține detalii despre un container specific
     */
    getContainerById(containerId: number): Observable<ContainerDetails> {
        return this.http.get<ContainerDetails>(`${this.apiUrl}/containers/${containerId}`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Repornește un container
     */
    restartContainer(containerId: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/containers/${containerId}/restart`, {})
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține fragmentele dintr-un container
     */
    getContainerFragments(containerId: number, page: number = 1, limit: number = 10): Observable<any> {
        const params = new HttpParams()
            .set('page', page.toString())
            .set('limit', limit.toString());

        return this.http.get(`${this.apiUrl}/containers/${containerId}/fragments`, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Mută un fragment dintr-un container în altul
     */
    moveFragment(fragmentId: number, targetContainerId: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/containers/move-fragment`, { fragmentId, targetContainerId })
            .pipe(catchError(this.handleError));
    }

    /**
     * Verifică starea de sănătate a containerelor
     */
    checkContainersHealth(): Observable<any> {
        return this.http.get(`${this.apiUrl}/containers/health`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține distribuția fragmentelor între containere
     */
    getFragmentDistribution(): Observable<FragmentDistribution> {
        return this.http.get<FragmentDistribution>(`${this.apiUrl}/containers/distribution`)
            .pipe(catchError(this.handleError));
    }

    /**
     * Reechilibrează distribuția fragmentelor între containere
     */
    rebalanceContainers(force: boolean = false): Observable<any> {
        const params = new HttpParams().set('force', force.toString());
        return this.http.post(`${this.apiUrl}/containers/rebalance`, {}, { params })
            .pipe(catchError(this.handleError));
    }

    /**
     * Obține statistici generale despre sistem
     */
    getSystemStats(): Observable<SystemStats> {
        return this.http.get<SystemStats>(`${this.apiUrl}/stats`)
            .pipe(catchError(this.handleError));
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