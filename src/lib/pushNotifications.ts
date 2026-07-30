/** Register Expo push token and upsert into device_push_tokens via RPC. */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerDevicePushToken(role: 'tech' | 'customer'): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (!token) return null;

    const { error } = await supabase.rpc('upsert_device_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_role: role,
    });
    if (error) {
      console.warn('[push] upsert_device_push_token', error.message);
      return null;
    }
    return token;
  } catch (e) {
    console.warn('[push] register failed', e);
    return null;
  }
}
