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
  login: (email: string, password: string) => Promise<AuthSessionUser>;
  loginWithGoogle: (idToken: string) => Promise<AuthSessionUser>;
  logout: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      currentUser,
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
        const session = await authService.loginWithGoogle(idToken);

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
      logout() {
        setCurrentUser(null);
      },
    }),
    [currentUser]
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
