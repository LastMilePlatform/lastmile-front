import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthSession } from '@/modules/auth/context/AuthSessionContext';
import { type AuctionBidMode, createAuction } from '@/services/api/auctionsService';

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Error desconocido.';
  const rawMessage = error.message?.trim();
  if (!rawMessage) return 'Error desconocido.';
  try {
    const parsed = JSON.parse(rawMessage) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(' | ');
    if (typeof parsed.message === 'string') return parsed.message;
    return rawMessage;
  } catch {
    return rawMessage;
  }
}

export function CreateAuctionScreen() {
  const router = useRouter();
  const { currentUser } = useAuthSession();

  const [itemName, setItemName] = useState('');
  const [initialPrice, setInitialPrice] = useState('');
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [bidMode, setBidMode] = useState<AuctionBidMode>('free');
  const [bidIncrement, setBidIncrement] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit =
    itemName.trim().length >= 2 &&
    initialPrice.trim().length > 0 &&
    durationMinutes.trim().length > 0 &&
    (bidMode === 'free' || bidIncrement.trim().length > 0) &&
    !isSubmitting;

  const handleSubmit = async () => {
    const trimmedItemName = itemName.trim();
    const parsedInitialPrice = parseFloat(initialPrice);
    const parsedDuration = parseInt(durationMinutes, 10);

    if (trimmedItemName.length < 2) {
      setFormError('El nombre del artículo debe tener al menos 2 caracteres.');
      return;
    }
    if (isNaN(parsedInitialPrice) || parsedInitialPrice <= 0) {
      setFormError('El precio inicial debe ser un número mayor a 0.');
      return;
    }
    if (isNaN(parsedDuration) || parsedDuration <= 0) {
      setFormError('La duración debe ser un número de minutos mayor a 0.');
      return;
    }

    let parsedBidIncrement: number | undefined;
    if (bidMode === 'fixed_increment') {
      parsedBidIncrement = parseFloat(bidIncrement);
      if (isNaN(parsedBidIncrement) || parsedBidIncrement <= 0) {
        setFormError('El incremento de puja debe ser un número mayor a 0.');
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await createAuction(
        {
          itemName: trimmedItemName,
          initialPrice: parsedInitialPrice,
          durationMinutes: parsedDuration,
          currency,
          bidMode,
          bidIncrement: parsedBidIncrement,
        },
        currentUser?.accessToken
      );

      router.replace('/organizer/auctions' as never);
    } catch (error) {
      setFormError(`No se pudo crear la subasta. ${getErrorMessage(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f6fb' }}>
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: '#ebebeb',
            borderRadius: 14,
            padding: 10,
            marginRight: 14,
          }}
        >
          <FontAwesome5 color='#111f3c' name='arrow-left' size={16} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              backgroundColor: '#dce8ff',
              borderRadius: 12,
              padding: 8,
              marginRight: 10,
            }}
          >
            <FontAwesome5 color='#1e73fa' name='gavel' size={16} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#111f3c' }}>
            Nueva subasta
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              padding: 20,
              shadowColor: '#163457',
              shadowOpacity: 0.08,
              shadowOffset: { width: 0, height: 6 },
              shadowRadius: 14,
              elevation: 4,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#27436d', marginBottom: 4 }}>
              Nombre del artículo *
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#d3e2fb',
                borderRadius: 14,
                backgroundColor: '#f8fbff',
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: '#18335f',
                marginBottom: 14,
              }}
              onChangeText={setItemName}
              placeholder='Ej: Bicicleta de montaña'
              placeholderTextColor='#8ea6c8'
              value={itemName}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#27436d', marginBottom: 4 }}>
              Precio inicial *
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#d3e2fb',
                borderRadius: 14,
                backgroundColor: '#f8fbff',
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: '#18335f',
                marginBottom: 14,
              }}
              keyboardType='numeric'
              onChangeText={setInitialPrice}
              placeholder='Ej: 50000'
              placeholderTextColor='#8ea6c8'
              value={initialPrice}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#27436d', marginBottom: 8 }}>
              Moneda
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {(['COP', 'USD'] as const).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderColor: currency === c ? '#1f5fe0' : '#d6e3fb',
                    backgroundColor: currency === c ? '#e8f0ff' : '#fff',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: currency === c ? '#1f4fb6' : '#4a6083',
                    }}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#27436d', marginBottom: 4 }}>
              Duración (minutos) *
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#d3e2fb',
                borderRadius: 14,
                backgroundColor: '#f8fbff',
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: '#18335f',
                marginBottom: 14,
              }}
              keyboardType='number-pad'
              onChangeText={setDurationMinutes}
              placeholder='60'
              placeholderTextColor='#8ea6c8'
              value={durationMinutes}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#27436d', marginBottom: 8 }}>
              Modo de puja
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {([
                { value: 'free' as AuctionBidMode, label: 'Puja libre' },
                { value: 'fixed_increment' as AuctionBidMode, label: 'Incremento fijo' },
              ]).map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setBidMode(option.value)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderColor: bidMode === option.value ? '#1f5fe0' : '#d6e3fb',
                    backgroundColor: bidMode === option.value ? '#e8f0ff' : '#fff',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: bidMode === option.value ? '#1f4fb6' : '#4a6083',
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {bidMode === 'fixed_increment' ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#27436d', marginBottom: 4 }}>
                  Incremento por puja *
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: '#d3e2fb',
                    borderRadius: 14,
                    backgroundColor: '#f8fbff',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    color: '#18335f',
                  }}
                  keyboardType='numeric'
                  onChangeText={setBidIncrement}
                  placeholder='Ej: 5000'
                  placeholderTextColor='#8ea6c8'
                  value={bidIncrement}
                />
              </>
            ) : null}
          </View>

          {formError ? (
            <View
              style={{
                marginTop: 12,
                backgroundColor: '#ffecef',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: '#9f2238' }}>{formError}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={{
              marginTop: 20,
              backgroundColor: canSubmit ? '#1f5fe0' : '#9db8e5',
              borderRadius: 18,
              paddingVertical: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color='#fff' size='small' />
            ) : (
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                Crear subasta
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: '#d3def3',
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#3a5176' }}>
              Cancelar
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
