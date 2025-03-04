import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
const API_URL = 'http://localhost:5000/api';

export interface User {
    id: number;
    email: string;
    name: string;
    surname: string;
    phone_number?: string;
    two_factor_enabled: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
    require2FA?: boolean;
    tempToken?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private apiUrl = `${API_URL}/auth`;
    private currentUserSubject: BehaviorSubject<User | null>;
    public currentUser: Observable<User | null>;
    private tokenExpirationTimer: any;
    private isBrowser: boolean;

    constructor(private http: HttpClient, private router: Router, @Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
        this.currentUserSubject = new BehaviorSubject<User | null>(this.getUserFromStorage());
        this.currentUser = this.currentUserSubject.asObservable();
    }

    register(userData: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/register`, userData)
            .pipe(
                catchError(this.handleError)
            );
    }

    login(email: string, password: string): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password })
            .pipe(
                tap(response => {
                    if (!response.require2FA) {
                        this.setSession(response);
                    }
                }),
                catchError(this.handleError)
            );
    }

    verify2FA(code: string, tempToken: string): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/verify-2fa`, { code, tempToken })
            .pipe(
                tap(response => {
                    this.setSession(response);
                }),
                catchError(this.handleError)
            );
    }

    logout(): void {
        if (this.isBrowser) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
        }
        this.currentUserSubject.next(null);
        this.clearTokenExpirationTimer();
        this.router.navigate(['/auth/login']);
    }

    enableTwoFactor(): Observable<any> {
        return this.http.post(`${this.apiUrl}/enable-2fa`, {})
            .pipe(catchError(this.handleError));
    }

    activateTwoFactor(code: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/activate-2fa`, { code })
            .pipe(
                tap(response => {
                    // Actualizează statusul 2FA al utilizatorului curent
                    const user = this.currentUserSubject.value;
                    if (user) {
                        user.two_factor_enabled = true;
                        this.currentUserSubject.next(user);
                        localStorage.setItem('user', JSON.stringify(user));
                    }
                }),
                catchError(this.handleError)
            );
    }

    disableTwoFactor(code: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/disable-2fa`, { code })
            .pipe(
                tap(response => {
                    // Actualizează statusul 2FA al utilizatorului curent
                    const user = this.currentUserSubject.value;
                    if (user) {
                        user.two_factor_enabled = false;
                        this.currentUserSubject.next(user);
                        localStorage.setItem('user', JSON.stringify(user));
                    }
                }),
                catchError(this.handleError)
            );
    }

    getProfile(): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/profile`)
            .pipe(catchError(this.handleError));
    }

    updateProfile(userData: Partial<User>): Observable<User> {
        return this.http.put<User>(`${this.apiUrl}/profile`, userData)
            .pipe(
                tap(updatedUser => {
                    // Actualizează utilizatorul curent
                    const currentUser = this.currentUserSubject.value;
                    if (currentUser) {
                        const newUser = { ...currentUser, ...updatedUser };
                        this.currentUserSubject.next(newUser);
                        localStorage.setItem('user', JSON.stringify(newUser));
                    }
                }),
                catchError(this.handleError)
            );
    }

    changePassword(currentPassword: string, newPassword: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/change-password`, { currentPassword, newPassword })
            .pipe(catchError(this.handleError));
    }

    get currentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    isAuthenticated(): boolean {
        return !!this.getToken();
    }

    getToken(): string | null {
        if (!this.isBrowser) {
            return null;
        }
        return localStorage.getItem('auth_token');
    }

    private setSession(authResult: AuthResponse): void {
        if (this.isBrowser) {
            localStorage.setItem('auth_token', authResult.token);
            localStorage.setItem('user', JSON.stringify(authResult.user));
            this.currentUserSubject.next(authResult.user);
            this.autoLogout(24 * 60 * 60 * 1000); // Auto logout după 24 ore
        }
    }

    private getUserFromStorage(): User | null {
        if (!this.isBrowser) {
            return null;
        }
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }

    private autoLogout(expirationDuration: number): void {
        if (!this.isBrowser) {
            return;
        }
        this.clearTokenExpirationTimer();
        this.tokenExpirationTimer = setTimeout(() => {
            this.logout();
        }, expirationDuration);
    }

    private clearTokenExpirationTimer(): void {
        if (this.tokenExpirationTimer) {
            clearTimeout(this.tokenExpirationTimer);
            this.tokenExpirationTimer = null;
        }
    }

    private handleError(error: any): Observable<never> {
        let errorMessage = 'A apărut o eroare';
        if (error.error instanceof ErrorEvent) {
            // Eroare client-side
            errorMessage = `frontend Eroare: ${error.error.message}`;
        } else {
            // Eroare backend
            errorMessage = error.error?.message || `backend Cod: ${error.status}, Mesaj: ${error.message}`;
        }
        console.error(errorMessage);
        return throwError(() => new Error(errorMessage));
    }
}