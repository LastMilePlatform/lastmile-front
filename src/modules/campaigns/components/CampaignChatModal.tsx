import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ChatMessage } from '@/modules/campaigns/utils/campaignsShared';

type CampaignChatModalProps = Readonly<{
  visible: boolean;
  campaignName?: string;
  messages: ChatMessage[];
  draft: string;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  inlineOnWeb?: boolean;
}>;

export function CampaignChatModal({
  visible,
  campaignName,
  messages,
  draft,
  onChangeDraft,
  onSend,
  onClose,
  inlineOnWeb = false,
}: CampaignChatModalProps) {
  const shouldRenderInline = Platform.OS === 'web' && inlineOnWeb;

  const chatContent = (
    <>
      <View className='flex-row items-center justify-between px-4 py-3'>
        <Text className='flex-1 text-base font-extrabold text-[#19335b]'>
          Chat {campaignName ? `- ${campaignName}` : ''}
        </Text>
        <Pressable className='h-10 w-10 items-center justify-center rounded-full bg-white' onPress={onClose}>
          <Text className='text-base font-bold text-[#1f4fb6]'>X</Text>
        </Pressable>
      </View>

      <ScrollView className='flex-1 px-4' contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        {messages.length === 0 ? (
          <Text className='mt-3 text-sm text-[#5d7498]'>Aun no hay mensajes. Inicia la conversacion.</Text>
        ) : null}

        {messages.map((message) => (
          <View className='rounded-xl bg-white px-3 py-2' key={message.id}>
            <Text className='text-xs font-semibold text-[#3b5783]'>
              {message.author} - {message.createdAt}
            </Text>
            <Text className='mt-1 text-sm text-[#1f365d]'>{message.message}</Text>
          </View>
        ))}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className='flex-row items-center gap-2 border-t border-[#dce6fb] bg-white px-4 py-3'>
          <TextInput
            className='flex-1 rounded-xl border border-[#d3e2fb] bg-[#f8fbff] px-3 py-2 text-[#18335f]'
            onChangeText={onChangeDraft}
            placeholder='Escribe un mensaje...'
            placeholderTextColor='#8ea6c8'
            value={draft}
          />
          <Pressable className='rounded-xl bg-[#1f5fe0] px-4 py-2' onPress={onSend}>
            <Text className='font-semibold text-white'>Enviar</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );

  if (shouldRenderInline) {
    if (!visible) {
      return null;
    }

    return (
      <View
        className='absolute bottom-4 right-4 top-28 w-[460px] max-w-[48%] overflow-hidden rounded-2xl border border-[#cfe0fb] bg-[#f4f8ff]'
        style={{
          zIndex: 90,
          shadowColor: '#102244',
          shadowOpacity: 0.2,
          shadowOffset: { width: 0, height: 12 },
          shadowRadius: 24,
          elevation: 10,
        }}
      >
        {chatContent}
      </View>
    );
  }

  return (
    <Modal animationType='slide' onRequestClose={onClose} visible={visible}>
      <View className='flex-1 bg-[#f4f8ff] pt-12'>
        {chatContent}
      </View>
    </Modal>
  );
}
