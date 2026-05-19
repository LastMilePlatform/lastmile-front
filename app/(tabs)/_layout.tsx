import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { useVolunteerLocationBroadcast } from '@/services/realtime/useVolunteerLocationBroadcast';

type TabIconProps = {
  focused: boolean;
  color: string;
  name: React.ComponentProps<typeof Ionicons>['name'];
};

type AppTabRouteName = 'home' | 'missions' | 'map' | 'auctions' | 'profile';

function getTabIconName(routeName: AppTabRouteName): React.ComponentProps<typeof Ionicons>['name'] {
  switch (routeName) {
    case 'home':
      return 'home';
    case 'missions':
      return 'reader';
    case 'map':
      return 'map';
    case 'auctions':
      return 'hammer';
    case 'profile':
      return 'person';
    default:
      return 'ellipse';
  }
}

function TabIcon({ focused, color, name }: TabIconProps) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.94)).current;
  const translateY = useRef(new Animated.Value(focused ? -1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1 : 0.94,
        tension: 220,
        friction: 18,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: focused ? -1 : 0,
        tension: 220,
        friction: 18,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, scale, translateY]);

  return (
    <Animated.View
      style={{
        transform: [{ scale }, { translateY }],
      }}
    >
      <View
        style={{
          backgroundColor: focused ? 'rgba(10, 132, 255, 0.14)' : 'transparent',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 4,
        }}
      >
        <Ionicons color={color} name={name} size={16} />
      </View>
    </Animated.View>
  );
}

function CustomTabsBar({ state, descriptors, navigation }: Readonly<BottomTabBarProps>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom - 6, 6),
        zIndex: 50,
      }}
    >
      <View
        style={{
          marginHorizontal: 12,
          minHeight: 72,
          borderRadius: 28,
          backgroundColor: '#fbfbfd',
          paddingHorizontal: 8,
          paddingVertical: 4,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          shadowColor: '#0b1324',
          shadowOpacity: 0.15,
          shadowOffset: { width: 0, height: 12 },
          shadowRadius: 24,
          elevation: 0,
        }}
      >
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor.options;
          const isFocused = state.index === index;
          const activeColor = '#0a84ff';
          const inactiveColor = '#8e8e93';
          const color = isFocused ? activeColor : inactiveColor;
          const routeName = route.name as AppTabRouteName;
          const iconName = getTabIconName(routeName);

          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
              }}
            >
              <TabIcon color={color} focused={isFocused} name={iconName} />
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: '600',
                  color,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function VolunteerLocationBroadcaster() {
  const { currentUser } = useAuthSession();
  useVolunteerLocationBroadcast(
    currentUser?.accessToken,
    currentUser?.id,
  );
  return null;
}

export default function TabsLayout() {
  const { currentUser } = useAuthSession();
  const isDonor = currentUser?.role === 'donor';
  const isVolunteer = currentUser?.role === 'volunteer';
  const hideBottomTabs = isDonor || (isVolunteer && Platform.OS === 'web');

  if (!currentUser) {
    return <Redirect href='/(auth)/login' />;
  }

  return (
    <>
      {isVolunteer ? <VolunteerLocationBroadcaster /> : null}
    <Tabs
      tabBar={(props) => (hideBottomTabs ? null : <CustomTabsBar {...props} />)}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0a84ff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarHideOnKeyboard: true,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name='home'
        options={{
          href: isDonor ? null : undefined,
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name='home' />
          ),
        }}
      />
      <Tabs.Screen
        name='missions'
        options={{
          title: isDonor ? 'Campañas' : 'Misiones',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name={isDonor ? 'megaphone' : 'reader'} />
          ),
        }}
      />
      <Tabs.Screen
        name='map'
        options={{
          title: isDonor ? 'Inicio' : 'Mapa',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name='map' />
          ),
        }}
      />
      <Tabs.Screen
        name='auctions'
        options={{
          href: isDonor ? null : undefined,
          title: 'Subastas',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name='hammer' />
          ),
        }}
      />
      <Tabs.Screen
        name='profile'
        options={{
          href: isDonor ? null : undefined,
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon color={color} focused={focused} name='person' />
          ),
        }}
      />
    </Tabs>
    </>
  );
}