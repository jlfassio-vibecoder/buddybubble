/**
 * BuddyBubble has no Interval Timers equipment_zones inventory.
 * Zone-based resolution in prepare-workout-chain-request is skipped unless extended later.
 */

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
}

export interface Zone {
  id: string;
  name: string;
  category: string;
  description: string;
  biomechanicalConstraints: string[];
  equipmentIds: string[];
  createdAt: Date;
}

export async function getAllEquipmentItemsServer(): Promise<EquipmentItem[]> {
  return [];
}

export async function getZoneByIdServer(_id: string): Promise<Zone | null> {
  return null;
}
