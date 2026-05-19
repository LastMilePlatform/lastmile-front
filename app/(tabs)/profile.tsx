import { Redirect } from 'expo-router';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { ProfileScreen } from '@/modules/profile/screens/ProfileScreen';

export default function ProfileRoute() {
	const { currentUser } = useAuthSession();

	if (!currentUser) {
		return <Redirect href='/(auth)/login' />;
	}

	return <ProfileScreen />;
}