import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';

type SelectableRole = 'donor' | 'volunteer';

const ROLES: {
  key: SelectableRole;
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  {
    key: 'donor',
    label: 'Donante',
    description: 'Quiero apoyar campañas con donaciones de dinero o artículos.',
    icon: 'hand-holding-heart',
    color: '#1f5fe0',
    bg: '#eaf2ff',
    border: '#c2d8ff',
  },
  {
    key: 'volunteer',
    label: 'Voluntario',
    description: 'Quiero ayudar en el campo participando en misiones de entrega.',
    icon: 'hands-helping',
    color: '#0e9f6e',
    bg: '#e8faf3',
    border: '#b3e8d5',
  },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error. Intenta nuevamente.';
}

export function GoogleRoleSelectScreen() {
  const router = useRouter();
  const { completeGoogleLogin } = useAuthSession();
  const [selected, setSelected] = useState<SelectableRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setError('');

    try {
      const user = await completeGoogleLogin(selected);
      router.replace(user.redirectTo as never);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className='flex-1 bg-[#f3f4f6]'>
      <View className='flex-1 px-6 py-10 justify-center'>
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <View className='mb-2 items-center'>
            <View className='h-16 w-16 items-center justify-center rounded-2xl bg-[#e8f0ff]'>
              <FontAwesome5 color='#1f5fe0' name='user-tag' size={28} />
            </View>
          </View>

          <Text className='mt-4 text-center text-2xl font-extrabold text-[#122648]'>
            ¿Cómo quieres participar?
          </Text>
          <Text className='mt-2 text-center text-sm text-[#4a5f80]'>
            Elige el rol con el que te registrarás en la plataforma.
            Esta decisión define tu experiencia en LastMile.
          </Text>
        </Animated.View>

        <View className='mt-8 gap-4'>
          {ROLES.map((role, i) => {
            const isActive = selected === role.key;
            return (
              <Animated.View
                entering={FadeInDown.delay(160 + i * 80).duration(450)}
                key={role.key}
              >
                <Pressable
                  className='rounded-2xl border-2 p-5'
                  onPress={() => setSelected(role.key)}
                  style={{
                    backgroundColor: isActive ? role.bg : '#ffffff',
                    borderColor: isActive ? role.color : '#dfe8ff',
                  }}
                >
                  <View className='flex-row items-center'>
                    <View
                      className='h-12 w-12 items-center justify-center rounded-xl'
                      style={{ backgroundColor: role.bg }}
                    >
                      <FontAwesome5
                        color={role.color}
                        name={role.icon}
                        size={20}
                      />
                    </View>

                    <View className='ml-4 flex-1'>
                      <View className='flex-row items-center justify-between'>
                        <Text
                          className='text-base font-bold'
                          style={{ color: isActive ? role.color : '#122648' }}
                        >
                          {role.label}
                        </Text>
                        {isActive && (
                          <View
                            className='h-6 w-6 items-center justify-center rounded-full'
                            style={{ backgroundColor: role.color }}
                          >
                            <FontAwesome5
                              color='#ffffff'
                              name='check'
                              size={10}
                            />
                          </View>
                        )}
                      </View>
                      <Text className='mt-1 text-sm leading-5 text-[#5a6b85]'>
                        {role.description}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {error ? (
          <Animated.View
            entering={FadeInUp.duration(220)}
            layout={Layout.springify()}
          >
            <Text className='mt-4 text-center text-sm text-[#c3324d]'>
              {error}
            </Text>
          </Animated.View>
        ) : null}

        <Animated.View
          className='mt-8'
          entering={FadeInDown.delay(360).duration(450)}
        >
          <Pressable
            className='rounded-xl px-4 py-4'
            disabled={!selected || isSubmitting}
            onPress={handleConfirm}
            style={{
              backgroundColor:
                !selected || isSubmitting ? '#9eb8e8' : '#1f5fe0',
            }}
          >
            <Text className='text-center text-base font-bold text-white'>
              {isSubmitting ? 'Creando cuenta...' : 'Confirmar y continuar'}
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(420).duration(450)}>
          <Pressable
            className='mt-3 py-3'
            onPress={() => router.replace('/(auth)/login' as never)}
          >
            <Text className='text-center text-sm text-[#88a0c6]'>
              Volver al inicio de sesión
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
