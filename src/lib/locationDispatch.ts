import * as Location from 'expo-location';
import { updateBookingRow } from './supabase';

export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function pushTechGpsToBooking(referenceCode: string) {
  const granted = await ensureLocationPermission();
  if (!granted) return false;

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  await updateBookingRow(referenceCode, {
    dispatch_lat: pos.coords.latitude,
    dispatch_lng: pos.coords.longitude,
  });
  return true;
}
