import { FontAwesome5 } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';

import type { NotificationItem } from '@/modules/notifications/hooks/useRealtimeNotifications';

type NotificationsBellProps = Readonly<{
  notifications: NotificationItem[];
  unreadCount: number;
  toastMessage: string | null;
  onMarkAllAsRead: () => void;
}>;

export function NotificationsBell({
  notifications,
  unreadCount,
  toastMessage,
  onMarkAllAsRead,
}: NotificationsBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const isWeb = Platform.OS === 'web';
  const { width: viewportWidth } = useWindowDimensions();
  const panelWidth = 360;

  const handleOpen = (event?: GestureResponderEvent) => {
    if (isWeb && event?.nativeEvent) {
      setAnchor({
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      });
    }

    setIsOpen(true);
    onMarkAllAsRead();
  };

  const fallbackLeft = Math.max(12, viewportWidth - panelWidth - 20);
  const panelLeft = anchor
    ? Math.max(12, Math.min(viewportWidth - panelWidth - 12, anchor.x - panelWidth + 28))
    : fallbackLeft;
  const panelTop = (anchor?.y ?? 74) + 16;

  const notificationListContent = (
    <>
      <View className='flex-row items-center justify-between'>
        <Text className='text-base font-extrabold text-[#17345a]'>Notificaciones</Text>
        <Pressable onPress={() => setIsOpen(false)}>
          <Text className='text-sm font-semibold text-[#1f5fe0]'>Cerrar</Text>
        </Pressable>
      </View>

      <ScrollView className='mt-3 max-h-72'>
        {notifications.length === 0 ? (
          <Text className='text-sm text-[#5c7297]'>Aun no hay notificaciones.</Text>
        ) : (
          notifications.map((notification) => (
            <View
              className='mb-2 rounded-xl border border-[#d8e6ff] bg-[#f8fbff] px-3 py-2'
              key={notification.notificationId}
            >
              <Text className='text-sm font-semibold text-[#17345a]'>{notification.message}</Text>
              <Text className='mt-1 text-xs text-[#5c7297]'>
                {new Date(notification.createdAt).toLocaleString('es-CO')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );

  return (
    <View style={{ position: 'relative', zIndex: 3000, elevation: 3000 }}>
      <Pressable
        className='h-10 w-10 items-center justify-center rounded-full bg-white'
        onPress={(event) => handleOpen(event)}
        style={{
          shadowColor: '#17345a',
          shadowOpacity: 0.14,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        <FontAwesome5 color='#1f5fe0' name='bell' size={16} />
        {unreadCount > 0 ? (
          <View className='absolute -right-1 -top-1 min-w-[18px] items-center rounded-full bg-[#cf3a4a] px-1'>
            <Text className='text-[10px] font-bold text-white'>{Math.min(unreadCount, 99)}</Text>
          </View>
        ) : null}
      </Pressable>

      {toastMessage ? (
        <View
          className='absolute right-0 top-12 flex-row items-center rounded-xl bg-[#17345a] px-3 py-2'
          pointerEvents='none'
          style={{
            shadowColor: '#0b1324',
            shadowOpacity: 0.2,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 10,
            maxWidth: 360,
            minWidth: 240,
            zIndex: 9999,
            elevation: 9999,
          }}
        >
          <FontAwesome5 color='#9dc2ff' name='bell' size={11} style={{ marginRight: 8 }} />
          <Text className='flex-1 text-xs font-medium text-white' numberOfLines={1}>
            {toastMessage}
          </Text>
        </View>
      ) : null}

      <Modal animationType='fade' transparent visible={isOpen}>
        {isWeb ? (
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => setIsOpen(false)}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View style={{ position: 'absolute', top: panelTop, left: panelLeft }}>
              <View
                style={{
                  width: panelWidth,
                  maxWidth: 420,
                  borderRadius: 14,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#d8e6ff',
                  padding: 12,
                  shadowColor: '#0b1324',
                  shadowOpacity: 0.18,
                  shadowOffset: { width: 0, height: 8 },
                  shadowRadius: 16,
                  elevation: 10,
                }}
              >
                {notificationListContent}
              </View>
            </View>
          </View>
        ) : (
          <View className='flex-1 justify-start bg-[#07163155] pt-24'>
            <View className='mx-4 rounded-2xl bg-white p-4'>{notificationListContent}</View>
          </View>
        )}
      </Modal>
    </View>
  );
}
