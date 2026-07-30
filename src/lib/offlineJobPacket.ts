import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DispatchBooking } from './supabase';

const STORAGE_KEY = 'adaptivity.tech.offlineJobPackets';

export type OfflineJobPacket = {
  id: string;
  referenceCode: string;
  customer: string;
  phone: string;
  address: string;
  vehicle: string;
  services: string[];
  notes: string | null;
  status: string;
  photoCount?: number;
  cachedAt: string;
};

function fromBooking(job: DispatchBooking, notes?: string | null): OfflineJobPacket {
  return {
    id: job.id,
    referenceCode: job.referenceCode,
    customer: job.customer,
    phone: job.phone,
    address: job.address,
    vehicle: job.vehicle,
    services: job.services,
    notes: notes?.trim() || null,
    status: job.status,
    cachedAt: new Date().toISOString(),
  };
}

export async function listOfflineJobPackets(): Promise<OfflineJobPacket[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineJobPacket[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(packets: OfflineJobPacket[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(packets.slice(0, 20)));
}

/** Cache a claimed/active job for offline reference. */
export async function cacheOfflineJobPacket(
  job: DispatchBooking,
  opts?: { notes?: string | null; photoCount?: number }
): Promise<void> {
  if (job.status === 'UNASSIGNED' || job.status === 'COMPLETED' || job.status === 'CANCELED') {
    return;
  }
  const packet = fromBooking(job, opts?.notes);
  if (opts?.photoCount != null) packet.photoCount = opts.photoCount;
  const existing = await listOfflineJobPackets();
  const next = [packet, ...existing.filter((p) => p.id !== job.id && p.referenceCode !== job.referenceCode)];
  await writeAll(next);
}

/** Refresh packets for all claimed/active jobs currently on the board. */
export async function syncOfflineJobPackets(jobs: DispatchBooking[]): Promise<void> {
  const active = jobs.filter(
    (j) => j.status !== 'UNASSIGNED' && j.status !== 'COMPLETED' && j.status !== 'CANCELED'
  );
  const existing = await listOfflineJobPackets();
  const byId = new Map(existing.map((p) => [p.id, p]));
  const next = active.map((j) => {
    const prev = byId.get(j.id);
    return {
      ...fromBooking(j, prev?.notes),
      photoCount: prev?.photoCount,
    };
  });
  await writeAll(next);
}

export async function clearOfflineJobPacket(jobIdOrRef: string): Promise<void> {
  const existing = await listOfflineJobPackets();
  await writeAll(
    existing.filter((p) => p.id !== jobIdOrRef && p.referenceCode !== jobIdOrRef)
  );
}
