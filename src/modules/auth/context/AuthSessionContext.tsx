import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

import type { UserRole } from '@/constants/roles';
import { authService } from '@/services/auth/authService';

export type AuthSessionUser = {
  id: number;
  email: string;
  role: UserRole;
  accessToken: string;
  redirectTo: string;
};

export type GoogleLoginResult =
  | AuthSessionUser
  | { requiresRoleSelection: true };

function getRedirectByRole(role: UserRole) {
  if (role === 'organizer') {
    return '/organizer/create-mission';
  }

  if (role === 'donor') {
    return '/(tabs)/map';
  }

  return '/(tabs)/home';
}

type AuthSessionContextValue = {
  currentUser: AuthSessionUser | null;
  pendingGoogleToken: string | null;
  login: (email: string, password: string) => Promise<AuthSessionUser>;
  loginWithGoogle: (idToken: string) => Promise<GoogleLoginResult>;
  completeGoogleLogin: (role: 'donor' | 'volunteer') => Promise<AuthSessionUser>;
  logout: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      currentUser,
      pendingGoogleToken,
      async login(email: string, password: string) {
        const session = await authService.login({
          email: email.trim().toLowerCase(),
          password,
        });

        const authenticatedUser: AuthSessionUser = {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
          accessToken: session.accessToken,
          redirectTo: getRedirectByRole(session.user.role),
        };

        setCurrentUser(authenticatedUser);
        return authenticatedUser;
      },
      async loginWithGoogle(idToken: string) {
        const result = await authService.loginWithGoogle(idToken);

        if ('requiresRoleSelection' in result) {
          setPendingGoogleToken(idToken);
          return { requiresRoleSelection: true };
        }

        const authenticatedUser: AuthSessionUser = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          accessToken: result.accessToken,
          redirectTo: getRedirectByRole(result.user.role),
        };

        setCurrentUser(authenticatedUser);
        return authenticatedUser;
      },
      async completeGoogleLogin(role: 'donor' | 'volunteer') {
        if (!pendingGoogleToken) {
          throw new Error('No hay un inicio de sesión con Google pendiente.');
        }

        const result = await authService.loginWithGoogle(pendingGoogleToken, role);

        if ('requiresRoleSelection' in result) {
          throw new Error('Error al completar el registro con Google.');
        }

        const authenticatedUser: AuthSessionUser = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          accessToken: result.accessToken,
          redirectTo: getRedirectByRole(result.user.role),
        };

        setPendingGoogleToken(null);
        setCurrentUser(authenticatedUser);
        return authenticatedUser;
      },
      logout() {
        setCurrentUser(null);
        setPendingGoogleToken(null);
      },
    }),
    [currentUser, pendingGoogleToken]
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider');
  }

  return context;
}
