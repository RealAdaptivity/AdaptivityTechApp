import { supabase } from './supabase';

/** Specialty → suggested van inventory checklist. */
export const SPECIALTY_INVENTORY: Record<string, string[]> = {
  brakes: ['Pad assortment', 'Rotor gauge', 'Brake cleaner', 'Torque wrench', 'C-clamp / caliper tool'],
  oil: ['Oil drain pan', 'Filter wrenches', 'Funnel set', 'Gloves / rags', 'Common filter SKUs'],
  battery: ['Jump pack', 'Multimeter', 'Terminal cleaner', 'Common battery sizes'],
  diagnostics: ['OBD scanner', 'Test light', 'Multimeter', 'Smoke machine (optional)'],
  electrical: ['Multimeter', 'Wire strippers', 'Heat shrink', 'Fuse assortment'],
  suspension: ['Jack + stands', 'Ball joint separator', 'Torque wrench', 'Penetrating oil'],
  ac: ['Manifold gauges', 'Vacuum pump', 'UV dye', 'R134a / R1234yf (as licensed)'],
  transmission: ['Fluid pump', 'Correct ATF', 'Filter gasket kit', 'Scan tool'],
  bodywork: ['Body filler kit', 'Sanding blocks', 'Primer', 'Masking'],
  detailing: ['Wash mitt', 'Clay bar', 'Compound/polish', 'Microfiber set'],
  full_auto: ['Basic hand tools', 'Jack + stands', 'Scan tool', 'Multimeter'],
};

export const INVENTORY_SPECIALTY_KEYS = Object.keys(SPECIALTY_INVENTORY);

export async function loadInventoryChecks(specialty: string): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('tech_inventory_checks')
    .select('checked_items')
    .eq('tech_id', user.id)
    .eq('specialty', specialty)
    .maybeSingle();
  if (error) throw error;
  const items = data?.checked_items;
  return Array.isArray(items) ? (items as string[]) : [];
}

export async function saveInventoryChecks(specialty: string, checkedItems: string[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required');
  const { error } = await supabase.from('tech_inventory_checks').upsert({
    tech_id: user.id,
    specialty,
    checked_items: checkedItems,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
