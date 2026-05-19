import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { DonorBottomTabs, VOLUNTEER_WEB_PANEL_OFFSET } from '@/modules/donor/components/DonorBottomTabs';


import {
  OrganizerBottomTabs,
  ORGANIZER_WEB_PANEL_OFFSET,
} from '@/modules/organizer/components/OrganizerBottomTabs';

function getRoleLabel(role?: string) {
  if (role === 'organizer') {
    return 'Organizador';
  }

  if (role === 'donor') {
    return 'Donante';
  }

  if (role === 'volunteer') {
    return 'Voluntario';
  }

  return 'Sin sesion';
}

export function ProfileScreen() {
  const router = useRouter();
  const { currentUser, logout } = useAuthSession();
  const isOrganizer = currentUser?.role === 'organizer';
  const isDonor = currentUser?.role === 'donor';
  const isVolunteer = currentUser?.role === 'volunteer';
  const isWeb = Platform.OS === 'web';
  const hasBottomTabs = isOrganizer || isDonor || isVolunteer;
  let webPanelInset = 0;
  if (isWeb) {
    if (isOrganizer) {
      webPanelInset = ORGANIZER_WEB_PANEL_OFFSET;
    } else if (isVolunteer) {
      webPanelInset = VOLUNTEER_WEB_PANEL_OFFSET;
    } else if (isDonor) {
      webPanelInset = 250;
    }
  }
  let contentBottomInset = 24;

  if (hasBottomTabs) {
    contentBottomInset = 120;
  }

  if ((isOrganizer || isVolunteer) && isWeb) {
    contentBottomInset = 24;
  }



  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className='flex-1 bg-[#eaf2ff]'>
      <View className='flex-1' style={{ paddingLeft: webPanelInset }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: contentBottomInset }}>
        <View
          className='rounded-2xl border border-[#d8e7ff] bg-white px-5 py-6'
          style={{ overflow: 'visible' }}
        >
          <View className='flex-row items-start justify-between' style={{ position: 'relative', zIndex: 1000, elevation: 1000 }}>
            <View className='flex-1 pr-3'>
              <Text className='text-2xl font-extrabold text-[#15325c]'>Perfil</Text>
              <Text className='mt-2 text-sm text-[#5b7190]'>
                Bienvenido de nuevo, {getRoleLabel(currentUser?.role)}
              </Text>
            </View>
            {/* Notificaciones eliminadas del perfil en web y móvil */}
          </View>

          <View className='mt-5 rounded-2xl bg-[#f7faff] px-4 py-4'>
            <Text className='text-xs font-semibold uppercase tracking-wider text-[#6b7a93]'>Correo</Text>
            <Text className='mt-1 text-base font-semibold text-[#1d355b]'>
              {currentUser?.email ?? 'No hay usuario autenticado'}
            </Text>
          </View>

          <View className='mt-3 rounded-2xl bg-[#f7faff] px-4 py-4'>
            <Text className='text-xs font-semibold uppercase tracking-wider text-[#6b7a93]'>Rol activo</Text>
            <Text className='mt-1 text-base font-semibold text-[#1d355b]'>
              {getRoleLabel(currentUser?.role)}
            </Text>
          </View>

          <Pressable
            className='mt-6 rounded-xl bg-[#cf3a4a] px-4 py-3'
            onPress={handleLogout}
          >
            <Text className='text-center text-base font-semibold text-white'>
              Cerrar sesion
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </View>

      {isOrganizer ? <OrganizerBottomTabs activeTab='perfil' /> : null}
      {isDonor ? <DonorBottomTabs activeTab='perfil' /> : null}
      {isVolunteer && isWeb ? <DonorBottomTabs activeTab='perfil' /> : null}
    </SafeAreaView>
  );
}