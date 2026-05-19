export type AuthRole = 'organizer' | 'donor' | 'volunteer';

export type MockUser = {
  role: AuthRole;
  label: string;
  email: string;
  password: string;
  redirectTo: string;
};

export const MOCK_USERS: MockUser[] = [
  {
    role: 'organizer',
    label: 'Organizador',
    email: 'organizador@lastmile.com',
    password: '123456',
    redirectTo: '/organizer/create-mission',
  },
  {
    role: 'donor',
    label: 'Donante',
    email: 'donante@lastmile.com',
    password: '123456',
    redirectTo: '/(tabs)/map',
  },
  {
    role: 'volunteer',
    label: 'Voluntario',
    email: 'voluntario@lastmile.com',
    password: '123456',
    redirectTo: '/(tabs)/home',
  },
];

export function validateMockCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  return MOCK_USERS.find(
    (user) =>
      user.email.toLowerCase() === normalizedEmail &&
      user.password === normalizedPassword
  );
}