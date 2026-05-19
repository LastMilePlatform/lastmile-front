import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';

export function GlobalLogoutButton() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { currentUser, logout } = useAuthSession();

  const isAuthRoute = pathname === '/login' || pathname === '/register';

  if (!currentUser || isAuthRoute) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  return (
    <Pressable
      onPress={handleLogout}
      style={{
        position: 'absolute',
        right: 20,
        top: insets.top + 8,
        zIndex: 50,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#cf3a4a',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 4,
      }}
    >
      <MaterialCommunityIcons color='#fff' name='logout' size={16} />
      <Text style={{ marginLeft: 6, fontWeight: '600', color: '#fff', fontSize: 13 }}>
        Salir
      </Text>
    </Pressable>
  );
}
