import { Stack } from 'expo-router';

import { AppProvider } from '@/providers/AppProvider';

import '../global.css';

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </AppProvider>
  );
}