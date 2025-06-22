import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { response } from 'express';
const API_URL = '/api';

export interface User {
    id: number;
    email: string;
    name: string;
    surname: string;
    phone_number?: string;
    role: string;
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
        return this.http.post<AuthResponse>(
            `${this.apiUrl}/verify-2fa`,
            { code, tempToken },
            {
                headers: {
                    'Authorization': `Bearer ${tempToken}`  // Trimite token-ul în header
                }
            }
        ).pipe(
            tap(response => {
                this.setSession(response);
            }),
            catchError(this.handleError)
        );
    }


    /**
     * Inițializează procesul de resetare a parolei
     * @param email Adresa de email a utilizatorului
     * @returns Observable cu rezultatul procesului de resetare
     */
    forgotPassword(email: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/forgot-password`, { email })
            .pipe(catchError(this.handleError));
    }

    /**
     * Verifică codul de resetare primit prin email
     * @param email Adresa de email a utilizatorului
     * @param resetCode Codul de resetare primit prin email
     * @returns Observable cu rezultatul verificării
     */
    verifyResetCode(email: string, resetCode: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/verify-reset-code`, { email, resetCode })
            .pipe(catchError(this.handleError));
    }

    /**
     * Verifică resetarea parolei cu autentificare în doi pași
     * @param email Adresa de email a utilizatorului
     * @param twoFactorCode Codul de autentificare în doi pași
     * @param resetToken Tokenul de resetare primit prin email
     * @returns Observable cu rezultatul verificării
     */
    verifyResetWith2FA(email: string, twoFactorCode: string, resetToken: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/verify-reset-2fa`, { email, twoFactorCode, resetToken })
            .pipe(catchError(this.handleError));
    }

    /**
     * Confirmă resetarea parolei
     * @param resetToken Tokenul de resetare primit prin email
     * @param newPassword Noua parolă a utilizatorului
     * @returns Observable cu rezultatul confirmării
     */
    resetPassword(resetToken: string, newPassword: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/reset-password`, { token: resetToken, newPassword })
            .pipe(catchError(this.handleError));
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
            this.autoLogout(0.5 * 60 * 60 * 1000); // Auto logout după 30min
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

        console.error('===== DETALII COMPLETE EROARE =====');
        console.log('Obiect eroare complet:', error);

        if (error.error instanceof ErrorEvent) {
            // Eroare client-side
            errorMessage = `frontend Eroare: ${error.error.message}`;
            console.error('Eroare client-side:', error.error);
        } else {
            // Eroare backend
            console.error('Status cod:', error.status);
            console.error('Status text:', error.statusText);
            console.error('URL:', error.url);
            console.error('Headers:', error.headers);

            if (error.error) {
                console.error('Corpul răspunsului (error.error):', error.error);
                if (typeof error.error === 'object') {
                    console.error('Mesaj în error.error:', error.error.message);
                    console.error('Alte proprietăți din error.error:', Object.keys(error.error));
                }
            }

            errorMessage = error.error?.message || `backend Cod: ${error.status}, Mesaj: ${error.message}`;
        }

        console.error('Mesaj de eroare final:', errorMessage);
        console.error('===== SFÂRȘIT DETALII EROARE =====');

        return throwError(() => new Error(errorMessage));
    }
}