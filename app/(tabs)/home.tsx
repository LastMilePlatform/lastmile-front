import { Redirect } from 'expo-router';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { HomeScreen } from '@/modules/missions/screens/HomeScreen';

export default function HomeRoute() {
	const { currentUser } = useAuthSession();

	if (!currentUser) {
		return <Redirect href='/(auth)/login' />;
	}

	if (currentUser.role === 'donor') {
		return <Redirect href='/(tabs)/map' />;
	}

	return <HomeScreen />;
}