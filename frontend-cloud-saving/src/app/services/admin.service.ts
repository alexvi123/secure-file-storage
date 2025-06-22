import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface SystemStats {
    totalUsers: number;
    totalFiles: number;
    totalSizeFormatted: string;
    newUsersThisMonth: number;
    storage?: {
        totalCapacityFormatted: string;
        usedStorageFormatted: string;
        availableStorageFormatted: string;
        usagePercent: number;
    };

}

export interface ContainerStats {
    distribution?: ContainerDistributionItem[];
    summary?: {
        totalFragments: number;
        totalSize: number;
        totalSizeFormatted: string;
        avgFragmentsPerContainer: number;
        mostLoadedContainer: number | null;
        leastLoadedContainer: number | null;
    };
    activeContainers?: number;
    healthStatus?: string;
}
export interface ContainerDistributionItem {
    id: number;
    name: string;
    status: string;
    health: string;
    fragmentCount: number;
    totalSize: number;
    totalSizeFormatted: string;
    storageUsed: number;
    storageUsedFormatted: string;
}


export interface Container {
    id: number;
    status: string;
    fragmentCount: number;
    storageUsed: number;
    storageTotal: number;
    storageUsedFormatted: string;
    storageTotalFormatted: string;
    storageUsagePercent: number;
}

export interface AdminUser {
    id: number;
    name: string;
    surname: string;
    email: string;
    role: string;
    fileCount: number;
    storageUsed: number;
    lastLogin: string;
    two_factor_enabled: boolean;
    storageUsedFormatted: string;
    created_at: string;

}
export interface UsersResponse {
    users: AdminUser[];
    pagination: {
        currentPage: number;
        totalPages: number;
        limit: number;
        total: number;
    };
}
export interface AdminFile {
    id: number;
    filename: string;
    userName: string;
    sizeFormatted: string;
    mimeType: string;
    fragmentCount: number;
    uploadedAt: string;
}

export interface Fragment {
    id: number;
    filename: string;
    sizeFormatted: string;
}

export interface HealthReport {
    overall: string;
    database: string;
    containers: string;
    storage: string;
    issues?: string[];
}

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private apiUrl = `${environment.apiUrl}/admin`;

    constructor(private http: HttpClient) { }

    // System Statistics
    getSystemStats(): Observable<SystemStats> {
        return this.http.get<SystemStats>(`${this.apiUrl}/stats`);
    }

    // Container Management
    getAllContainers(): Observable<any> {
        return this.http.get<Container[]>(`${this.apiUrl}/containers`);
    }

    getContainerById(id: number): Observable<Container> {
        return this.http.get<Container>(`${this.apiUrl}/containers/${id}`);
    }

    getContainerStats(): Observable<ContainerStats> {
        return this.http.get<ContainerStats>(`${this.apiUrl}/containers/distribution`);
    }


    restartContainer(containerId: number): Observable<any> {
        return this.http.post(`${this.apiUrl}/containers/${containerId}/restart`, {});
    }

    rebalanceContainers(): Observable<any> {
        return this.http.post(`${this.apiUrl}/containers/rebalance`, {});
    }


    // User Management
    getAllUsers(): Observable<UsersResponse> {
        return this.http.get<UsersResponse>(`${this.apiUrl}/users`);
    }

    getUserById(id: number): Observable<AdminUser> {
        return this.http.get<AdminUser>(`${this.apiUrl}/users/${id}`);
    }


    deleteUser(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/users/${id}`);
    }

    // File Management
    getAllFiles(): Observable<AdminFile[]> {
        return this.http.get<AdminFile[]>(`${this.apiUrl}/files`);
    }


    cleanupOrphanedFiles(): Observable<{ deletedCount: number }> {
        return this.http.post<{ deletedCount: number }>(`${this.apiUrl}/files/cleanup-orphaned`, {});
    }

    getStorageReport(): Observable<any> {
        return this.http.get(`${this.apiUrl}/storage/report`);
    }

    syncStorage(): Observable<any> {
        return this.http.post(`${this.apiUrl}/storage/sync`, {});
    }

    // System Maintenance
    cleanupTempFiles(): Observable<{ deletedCount: number }> {
        return this.http.post<{ deletedCount: number }>(`${this.apiUrl}/maintenance/cleanup-temp`, {});
    }

    optimizeDatabase(): Observable<any> {
        return this.http.post(`${this.apiUrl}/maintenance/optimize-db`, {});
    }

    createBackup(): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/maintenance/backup`, {
            responseType: 'blob'
        });
    }

    checkSystemHealth(): Observable<HealthReport> {
        return this.http.get<HealthReport>(`${this.apiUrl}/system/health`);
    }

    getSystemUptime(): Observable<{ uptime: string }> {
        return this.http.get<{ uptime: string }>(`${this.apiUrl}/system/uptime`);
    }

    // Metode pentru procesarea datelor
    formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    parseSize(sizeString: string): number {
        const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
        if (!match) return 0;

        const size = parseFloat(match[1]);
        const unit = match[2].toUpperCase();

        const multipliers: { [key: string]: number } = {
            'B': 1,
            'KB': 1024,
            'MB': 1024 ** 2,
            'GB': 1024 ** 3,
            'TB': 1024 ** 4
        };
        return size * (multipliers[unit] || 1);
    }

    downloadFile(data: Blob, filename: string): void {
        const url = window.URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }
}