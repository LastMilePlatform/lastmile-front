import { Redirect } from 'expo-router';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';

export default function Index() {
  const { currentUser } = useAuthSession();

  if (!currentUser) {
    return <Redirect href='/(auth)/login' />;
  }

  return <Redirect href={currentUser.redirectTo as never} />;
}