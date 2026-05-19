import { AntDesign, FontAwesome5 } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeInUp,
  Layout,
} from 'react-native-reanimated';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';

WebBrowser.maybeCompleteAuthSession();

const HERO_IMAGES = [
  require('../../../../assets/auth/login-hero.jpg'),
  require('../../../../assets/auth/login-hero-2.jpg'),
  require('../../../../assets/auth/login-hero-4.jpg'),
];

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

const redirectUri = AuthSession.makeRedirectUri({ scheme: 'lastmile-front' });

function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) {
    return 'No fue posible iniciar sesion. Intenta nuevamente.';
  }

  try {
    const parsed = JSON.parse(error.message) as {
      message?: string | string[];
    };

    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return parsed.message[0] ?? 'Credenciales invalidas.';
    }

    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
  } catch {
    // If backend did not return JSON text, fallback to known messages below.
  }

  if (error.message.includes('Network request failed')) {
    return 'No fue posible conectar con el backend. Verifica URL y red.';
  }

  return error.message;
}

export function LoginScreen() {
  const router = useRouter();
  const { currentUser, login, loginWithGoogle } = useAuthSession();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const contactEmails = [
    'isaac.palomo-p@mail.escuelaing.edu.co',
    'sebastian.duque-c@mail.escuelaing.edu.co',
    'samuel.albarracin-v@mail.escuelaing.edu.co',
  ];

  // Log para ver exactamente qué redirect URI se está usando
  console.log('[Google OAuth] redirectUri:', redirectUri);

  // Child component will handle Google auth hook to avoid calling hooks conditionally here
  function GoogleAuthButton({ onToken }: { onToken: (token: string) => void }) {
    // choose platform-appropriate client ids
    const clientIdForPlatform = Platform.OS === 'web' ? GOOGLE_WEB_CLIENT_ID : GOOGLE_CLIENT_ID;

    const [request, response, promptAsync] = Google.useAuthRequest({
      clientId: clientIdForPlatform,
      webClientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: 'id_token',
      extraParams: { prompt: 'select_account' },
    } as any);

    useEffect(() => {
      if (!response) return;
      if (response.type === 'success') {
        const idToken = response.authentication?.idToken ?? (response as any).params?.id_token;
        const accessToken = response.authentication?.accessToken;
        const tokenToSend = idToken ?? accessToken;
        if (tokenToSend) {
          onToken(tokenToSend as string);
        }
      } else if (response.type === 'error') {
        console.log('[Google OAuth] error:', JSON.stringify(response.error));
      }
    }, [response, onToken]);

    const disabled = !request;

    return (
      <Pressable
        className={`flex-row items-center justify-center rounded-xl border border-[#dfe8ff] bg-white px-4 py-4 ${disabled ? 'opacity-50' : ''}`}
        disabled={disabled || isSubmitting}
        onPress={() => void promptAsync()}
      >
        <AntDesign color='#EA4335' name='google' size={18} />
        <Text className='ml-2 text-base font-bold text-[#2d4468]'>Continuar con Google</Text>
      </Pressable>
    );
  }

  const isDisabled = useMemo(
    () => isSubmitting || !email.trim() || !password.trim(),
    [email, isSubmitting, password]
  );

  const handleLogin = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const matched = await login(email, password);
      router.replace(matched.redirectTo as never);
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async (idToken: string) => {
    setIsSubmitting(true);
    setError('');

    try {
      const result = await loginWithGoogle(idToken);
      if ('requiresRoleSelection' in result) {
        router.replace('/(auth)/google-role-select' as never);
      } else {
        router.replace(result.redirectTo as never);
      }
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  };


  useEffect(() => {
    if (currentUser) {
      router.replace(currentUser.redirectTo as never);
    }
  }, [currentUser, router]);

  useEffect(() => {
    if (!isDesktopWeb || HERO_IMAGES.length <= 1) {
      return;
    }

    const intervalId = setInterval(() => {
      setHeroImageIndex((current) => (current + 1) % HERO_IMAGES.length);
    }, 7000);

    return () => clearInterval(intervalId);
  }, [isDesktopWeb]);

  if (currentUser) {
    return null;
  }

  const formSection = (
    <Animated.View
      className='rounded-3xl border border-[#dfe8ff] bg-white/95 p-6'
      entering={FadeInDown.delay(100).duration(550)}
    >
      <Text className='text-2xl font-bold text-[#122648]'>Bienvenido</Text>
      <Text className='mt-1 text-base text-[#4a5f80]'>
        Ingresa tus credenciales para acceder a la plataforma.
      </Text>

      <Text className='mt-6 mb-2 text-sm font-medium text-[#2d4468]'>Correo Electrónico</Text>
      <TextInput
        autoCapitalize='none'
        className='rounded-xl border border-[#cad8f6] bg-[#f9fbff] px-4 py-3 text-[15px] text-[#13274a]'
        onChangeText={setEmail}
        placeholder='nombre@empresa.com'
        placeholderTextColor='#88a0c6'
        value={email}
      />

      <Text className='mt-4 mb-2 text-sm font-medium text-[#2d4468]'>Contraseña</Text>
      <View className='flex-row items-center rounded-xl border border-[#cad8f6] bg-[#f9fbff] px-4 py-3'>
        <TextInput
          className='flex-1 text-[15px] text-[#13274a]'
          onChangeText={setPassword}
          placeholder='••••••••'
          placeholderTextColor='#88a0c6'
          secureTextEntry={!showPassword}
          value={password}
        />
        <Pressable onPress={() => setShowPassword(!showPassword)}>
          <FontAwesome5
            color='#88a0c6'
            name={showPassword ? 'eye' : 'eye-slash'}
            size={18}
          />
        </Pressable>
      </View>

      {error ? (
        <Animated.View entering={FadeInUp.duration(220)} layout={Layout.springify()}>
          <Text className='mt-3 text-sm text-[#c3324d]'>{error}</Text>
        </Animated.View>
      ) : null}

      <Pressable
        className={`mt-6 rounded-xl px-4 py-4 ${
          isDisabled ? 'bg-[#9eb8e8]' : 'bg-[#1f5fe0]'
        }`}
        disabled={isDisabled}
        onPress={handleLogin}
      >
        <Text className='text-center text-base font-bold text-white'>
          {isSubmitting ? 'Ingresando...' : 'Iniciar Sesión'}
        </Text>
      </Pressable>

      <View className='my-4 flex-row items-center'>
        <View className='h-px flex-1 bg-[#dfe8ff]' />
        <Text className='mx-3 text-xs text-[#88a0c6]'>o continúa con</Text>
        <View className='h-px flex-1 bg-[#dfe8ff]' />
      </View>

      {/* Render Google auth button only when properly configured for the current platform */}
      {Platform.OS === 'web' ? (
        GOOGLE_WEB_CLIENT_ID ? (
          <GoogleAuthButton onToken={(t) => void handleGoogleLogin(t)} />
        ) : (
          <View className='text-xs text-[#9aa8c6]'>
            <Text style={{ color: '#9aa8c6' }}>Google login no configurado para web.</Text>
          </View>
        )
      ) : (
        <GoogleAuthButton onToken={(t) => void handleGoogleLogin(t)} />
      )}
    </Animated.View>
  );

  if (isDesktopWeb) {
    return (
      <SafeAreaView className='flex-1 bg-[#f3f4f6]'>
        <View className='h-14 flex-row items-center justify-between border-b border-[#e3e8f2] bg-white px-6'>
          <View className='flex-row items-center gap-8'>
            <Text className='text-xl font-extrabold text-[#1f5fe0]'>LastMile</Text>
            <Pressable
              className='flex-row items-center'
              onPress={() => setShowContacts((current) => !current)}
            >
              <Text
                className={`text-sm font-semibold ${
                  showContacts ? 'text-[#1f5fe0]' : 'text-[#5a6b85]'
                }`}
              >
                Contacto
              </Text>
              <FontAwesome5
                color={showContacts ? '#1f5fe0' : '#5a6b85'}
                name={showContacts ? 'chevron-up' : 'chevron-down'}
                size={10}
                style={{ marginLeft: 6 }}
              />
            </Pressable>
          </View>
          <View />
        </View>

        {showContacts ? (
          <Animated.View
            className='border-b border-[#d6e3fa] bg-[#f5f9ff] px-6 py-4'
            entering={FadeInDown.duration(220)}
            layout={Layout.springify()}
          >
            <View className='mx-auto w-full max-w-[1240px] rounded-xl border border-[#c9dbfb] bg-white p-5'>
              <View className='flex-row items-start justify-between'>
                <View className='flex-row items-center'>
                  <View className='h-8 w-8 items-center justify-center rounded-md bg-[#eaf2ff]'>
                    <FontAwesome5 color='#1f5fe0' name='envelope-open-text' size={11} />
                  </View>
                  <View className='ml-3'>
                    <Text className='text-[11px] font-bold uppercase tracking-[2px] text-[#1f5fe0]'>
                      Contacto
                    </Text>
                    <Text className='text-xs text-[#6d7f9e]'>Canales de atención</Text>
                  </View>
                </View>

                <Pressable
                  className='h-7 w-7 items-center justify-center rounded-full bg-[#f3f6fd]'
                  onPress={() => setShowContacts(false)}
                >
                  <FontAwesome5 color='#7d91b0' name='times' size={12} />
                </Pressable>
              </View>

              <Text className='mt-3 text-sm leading-5 text-[#5b6f93]'>
                Para atención y soporte, escríbenos a:
              </Text>

              <View className='mt-3 flex-row gap-3'>
                {contactEmails.map((email) => (
                  <View
                    className='flex-1 flex-row items-center rounded-lg border border-[#dbe6fb] bg-[#f8fbff] px-3 py-2.5'
                    key={email}
                  >
                    <FontAwesome5 color='#1f5fe0' name='envelope' size={11} />
                    <Text className='ml-2 text-xs font-semibold text-[#2d4468]'>{email}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        ) : null}

        <View className='flex-1 flex-row'>
          <View className='flex-1 justify-end overflow-hidden'>
            <Animated.Image
              entering={FadeIn.duration(900)}
              exiting={FadeOut.duration(900)}
              key={`hero-${heroImageIndex}`}
              resizeMode='cover'
              source={HERO_IMAGES[heroImageIndex]}
              style={[
                styles.heroImage,
                styles.heroImageLayer,
              ]}
            />

            <View style={styles.heroOverlayLayer} />
            <View className='px-12 pb-16' style={styles.heroContentLayer}>
              <Text className='text-xs font-semibold uppercase tracking-[3px] text-[#2ce8ff]'>
                Ayuda en tiempo real, impacto real
              </Text>
              <Text className='mt-6 max-w-[420px] text-6xl font-extrabold leading-[64px] text-white'>
                Guiando la logística hacia el futuro del impacto social.
              </Text>
              <Text className='mt-6 max-w-[420px] text-2xl leading-8 text-[#d5e7ff]'>
                Cada kilómetro optimizado es un recurso vital que llega a su destino más rápido.
              </Text>
            </View>
          </View>

          <View className='w-[44%] min-w-[460px] bg-[#f3f4f6] px-14 py-12'>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              className='flex-1 justify-between'
            >
              <View />
              {formSection}
              <View className='items-center pt-6'>
                <Text className='text-xs font-medium tracking-wide text-[#8a9fb8]'>
                  DESARROLLADO POR {' '}
                  <Text className='font-bold text-[#122648]'>EQUIPO GÉNESIS</Text>
                </Text>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className='flex-1 bg-[#f6f9ff]'>
      <View className='absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#c8dcff]' />
      <View className='absolute -right-24 top-32 h-72 w-72 rounded-full bg-[#ffe3bc]' />
      <View className='absolute bottom-16 left-8 h-40 w-40 rounded-full bg-[#d4ffe6]' />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className='flex-1 px-6 pb-6'
      >
        <Animated.View entering={FadeInDown.duration(550)} className='mt-8 items-center'>
          <View className='h-20 w-20 items-center justify-center rounded-3xl bg-[#e8f0ff]'>
            <FontAwesome5 color='#1f5fe0' name='bolt' size={32} />
          </View>
          <Text className='mt-4 text-4xl font-extrabold tracking-tight text-[#122648]'>
            Last<Text className='text-[#1f5fe0]'>Mile</Text>
          </Text>
          <Text className='mt-1 text-xs font-semibold uppercase tracking-widest text-[#4a5f80]'>
            Ayuda en tiempo real, impacto real.
          </Text>
        </Animated.View>

        <View className='mt-8'>{formSection}</View>

        <View className='mt-auto pt-6 pb-4 items-center'>
          <Text className='text-xs font-medium tracking-wide text-[#8a9fb8]'>
            DESARROLLADO POR {' '}
            <Text className='font-bold text-[#122648]'>EQUIPO GÉNESIS</Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageLayer: {
    zIndex: 0,
  },
  heroOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 48, 110, 0.7)',
    zIndex: 1,
  },
  heroContentLayer: {
    zIndex: 2,
  },
});
