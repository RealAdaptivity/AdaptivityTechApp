import * as Location from 'expo-location';
import { supabase, updateBookingRow } from './supabase';

export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Push tech GPS to booking. Optionally decay ETA when distance_miles is already set
 * (no Maps API — reduce eta_minutes by 1 each successful ping, floor 3).
 */
export async function pushTechGpsToBooking(
  referenceCode: string,
  _opts?: { customerLat?: number; customerLng?: number }
) {
  const granted = await ensureLocationPermission();
  if (!granted) return false;

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const patch: {
    dispatch_lat: number;
    dispatch_lng: number;
    eta_minutes?: number;
    distance_miles?: number;
  } = {
    dispatch_lat: pos.coords.latitude,
    dispatch_lng: pos.coords.longitude,
  };

  const { data: booking } = await supabase
    .from('bookings')
    .select('eta_minutes, distance_miles, status')
    .eq('reference_code', referenceCode)
    .maybeSingle();

  if (booking && (booking.status === 'EN_ROUTE' || booking.status === 'UNASSIGNED')) {
    const distanceMiles = Number(booking.distance_miles) || 0;
    const currentEta = Number(booking.eta_minutes) || 0;
    if (distanceMiles > 0 && currentEta > 0) {
      // Prefer formula from stored distance; otherwise decay by 1 per ping
      const fromDistance = Math.max(5, Math.round(distanceMiles * 2.5));
      const decayed = Math.max(3, currentEta - 1);
      patch.eta_minutes = Math.min(fromDistance, decayed);
    } else if (currentEta > 0) {
      patch.eta_minutes = Math.max(3, currentEta - 1);
    }
  }

  await updateBookingRow(referenceCode, patch);
  return true;
}
