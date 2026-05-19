import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';

export const VOLUNTEER_WEB_PANEL_OFFSET = 274;

type DonorTab = 'inicio' | 'campanas' | 'misiones' | 'mapa' | 'subastas' | 'perfil';

type DonorBottomTabsProps = Readonly<{
  activeTab: DonorTab;
}>;

type DonorTabButtonProps = Readonly<{
  id: DonorTab;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  route: string;
  isActive: boolean;
  onPress: (route: string) => void;
}>;

function DonorTabButton({ id, label, icon, route, isActive, onPress }: DonorTabButtonProps) {
  const scale = useRef(new Animated.Value(isActive ? 1 : 0.94)).current;
  const translateY = useRef(new Animated.Value(isActive ? -1 : 0)).current;
  const dotOpacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: isActive ? 1 : 0.94,
        tension: 220,
        friction: 18,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: isActive ? -1 : 0,
        tension: 220,
        friction: 18,
        useNativeDriver: true,
      }),
      Animated.timing(dotOpacity, {
        toValue: isActive ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dotOpacity, isActive, scale, translateY]);

  return (
    <Pressable className='flex-1 items-center justify-center py-2' key={id} onPress={() => onPress(route)}>
      <Animated.View
        style={{
          transform: [{ scale }, { translateY }],
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <View
          className='rounded-full px-3 py-1'
          style={{ backgroundColor: isActive ? 'rgba(10, 132, 255, 0.14)' : 'transparent' }}
        >
          <View className='h-5 w-5 items-center justify-center'>
            <FontAwesome5 color={isActive ? '#0a84ff' : '#8e8e93'} name={icon} size={16} />
          </View>
        </View>
        <Text className={`mt-1 text-xs font-semibold ${isActive ? 'text-[#0a84ff]' : 'text-[#8e8e93]'}`}>
          {label}
        </Text>
        <Animated.View className='mt-1 h-1 w-7 rounded-full bg-[#0a84ff]' style={{ opacity: dotOpacity }} />
      </Animated.View>
    </Pressable>
  );
}

type DonorSidebarButtonProps = Readonly<{
  label: string;
  icon: React.ComponentProps<typeof FontAwesome5>['name'];
  route: string;
  isActive: boolean;
  onPress: (route: string) => void;
}>;

function DonorSidebarButton({ label, icon, route, isActive, onPress }: DonorSidebarButtonProps) {
  return (
    <Pressable
      className={`mb-2 flex-row items-center rounded-2xl px-3 py-3 ${isActive ? 'bg-[#eaf2ff]' : 'bg-transparent'}`}
      onPress={() => onPress(route)}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-xl ${isActive ? 'bg-[#0a63ff]' : 'bg-[#edf3fb]'}`}>
        <FontAwesome5 color={isActive ? '#ffffff' : '#5d708d'} name={icon} size={15} />
      </View>
      <Text className={`ml-3 text-sm font-semibold ${isActive ? 'text-[#0e3472]' : 'text-[#55708f]'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function DonorBottomTabs({ activeTab }: DonorBottomTabsProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { currentUser } = useAuthSession();
  const isVolunteer = currentUser?.role === 'volunteer';
  const isDonor = currentUser?.role === 'donor';

  // Tabs para donor
  const donorTabs: Array<{
    id: DonorTab;
    label: string;
    icon: React.ComponentProps<typeof FontAwesome5>['name'];
    route: string;
  }> = [
    {
      id: 'inicio',
      label: 'Inicio',
      icon: 'map-marked-alt',
      route: '/(tabs)/map',
    },
    {
      id: 'campanas',
      label: 'Campañas',
      icon: 'bullhorn',
      route: '/(tabs)/missions',
    },
    {
      id: 'subastas',
      label: 'Subastas',
      icon: 'gavel',
      route: '/auctions',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: 'user',
      route: '/(tabs)/profile',
    },
  ];

  // Tabs para volunteer (ya existentes)
  const volunteerWebTabs: Array<{
    id: DonorTab;
    label: string;
    icon: React.ComponentProps<typeof FontAwesome5>['name'];
    route: string;
  }> = [
    {
      id: 'inicio',
      label: 'Inicio',
      icon: 'home',
      route: '/(tabs)/home',
    },
    {
      id: 'misiones',
      label: 'Misiones',
      icon: 'tasks',
      route: '/(tabs)/missions',
    },
    {
      id: 'mapa',
      label: 'Mapa',
      icon: 'map-marked-alt',
      route: '/(tabs)/map',
    },
    {
      id: 'subastas',
      label: 'Subastas',
      icon: 'gavel',
      route: '/(tabs)/auctions',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: 'user',
      route: '/(tabs)/profile',
    },
  ];

  // Mostrar panel lateral izquierdo en web para donor y volunteer
  if (isWeb && (isDonor || isVolunteer)) {
    const currentTabs = isDonor ? donorTabs : volunteerWebTabs;
    const currentPageLabel = currentTabs.find((tab) => tab.id === activeTab)?.label ?? 'Inicio';

    return (
      <View
        className='absolute z-50 w-[250px] rounded-[30px] border border-[#d6e3fb] bg-white px-4 py-5'
        style={{
          left: 12,
          top: Math.max(insets.top + 12, 12),
          bottom: 12,
          shadowColor: '#102244',
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: 12 },
          shadowRadius: 26,
          elevation: 0,
        }}
      >
        <Text className='text-xs font-semibold uppercase tracking-[0.28em] text-[#6d7e9a]'>
          Lastmile
        </Text>
        <Text className='mt-1 text-sm text-[#5a7190]'>
          Sección actual: {currentPageLabel}
        </Text>

        <View className='mt-6'>
          {currentTabs.map((tab) => (
            <DonorSidebarButton
              key={tab.id}
              icon={tab.icon}
              isActive={tab.id === activeTab}
              label={tab.label}
              onPress={(route) => router.push(route as never)}
              route={tab.route}
            />
          ))}
        </View>
      </View>
    );
  }

  // Panel inferior solo para móvil
  return (
    <View className='absolute left-0 right-0 z-50' style={{ bottom: Math.max(insets.bottom - 6, 6) }}>
      <View
        className='mx-3 flex-row items-center justify-around rounded-[28px] bg-[#fbfbfd] px-2 py-1'
        style={{
          minHeight: 72,
          shadowColor: '#0b1324',
          shadowOpacity: 0.15,
          shadowOffset: { width: 0, height: 12 },
          shadowRadius: 24,
          elevation: 0,
        }}
      >
        {donorTabs.map((tab) => (
          <DonorTabButton
            key={tab.id}
            icon={tab.icon}
            id={tab.id}
            isActive={tab.id === activeTab}
            label={tab.label}
            onPress={(route) => router.push(route as never)}
            route={tab.route}
          />
        ))}
      </View>
    </View>
  );
}
