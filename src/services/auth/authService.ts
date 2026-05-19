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

export const authService = {
  login(payload: LoginPayload) {
    return httpClient<AuthSession>('/auth/login', {
      method: 'POST',
      body: payload,
    });
  },

  loginWithGoogle(accessToken: string) {
    return httpClient<AuthSession>('/auth/google', {
      method: 'POST',
      body: { accessToken },
    });
  },
};
