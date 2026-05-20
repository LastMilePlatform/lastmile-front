import { httpClient } from '@/services/api/httpClient';

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthSession = {
  accessToken: string;
  user: {
    id: number;
    email: string;
    role: 'organizer' | 'volunteer' | 'donor';
  };
};

export type GoogleRoleRequired = {
  requiresRoleSelection: true;
};

export const authService = {
  login(payload: LoginPayload) {
    return httpClient<AuthSession>('/auth/login', {
      method: 'POST',
      body: payload,
    });
  },

  loginWithGoogle(accessToken: string, role?: 'donor' | 'volunteer') {
    return httpClient<AuthSession | GoogleRoleRequired>('/auth/google', {
      method: 'POST',
      body: { accessToken, ...(role ? { role } : {}) },
    });
  },
};
