import { Redirect } from 'expo-router';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { DonorCampaignsScreen } from '@/modules/campaigns/screens/DonorCampaignsScreen';
import { MissionsScreen } from '@/modules/missions/screens/MissionsScreen';

export default function MissionsRoute() {
	const { currentUser } = useAuthSession();

	if (!currentUser) {
		return <Redirect href='/(auth)/login' />;
	}

	if (currentUser.role === 'donor') {
		return <DonorCampaignsScreen />;
	}

	return <MissionsScreen />;
}