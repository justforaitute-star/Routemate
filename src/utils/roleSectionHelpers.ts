import { UserRole } from '../types';

export type SectionTabId =
  | 'overview'
  | 'routes'
  | 'stops'
  | 'pass'
  | 'roster'
  | 'alerts'
  | 'profile'
  | 'settings'
  | 'map';

export interface RoleDockTabSpec {
  id: SectionTabId;
  label: string;
  iconKey: 'overview' | 'routes' | 'stops' | 'pass' | 'roster' | 'alerts' | 'profile' | 'settings' | 'map';
  showUnreadBadge?: boolean;
}

export interface RoleSectionMeta {
  role: UserRole;
  badgeLabel: string;
  sectionTitle: string;
  sectionSubtitle: string;
}

const ROLE_META: Record<UserRole, RoleSectionMeta> = {
  guardian: {
    role: 'guardian',
    badgeLabel: 'Parent',
    sectionTitle: 'Parent Portal',
    sectionSubtitle: 'Family bus tracking, arrival alerts & stop ETAs',
  },
  driver: {
    role: 'driver',
    badgeLabel: 'Driver',
    sectionTitle: 'Driver Cockpit',
    sectionSubtitle: 'Hands-free Co-Driver, trip GPS & student boarding',
  },
  student: {
    role: 'student',
    badgeLabel: 'Student',
    sectionTitle: 'Student Bus Pass',
    sectionSubtitle: 'Personal arrival countdown & digital transit ID',
  },
  admin: {
    role: 'admin',
    badgeLabel: 'Admin',
    sectionTitle: 'Dispatch Console',
    sectionSubtitle: 'District fleet telemetry, roster & geofence rules',
  },
};

const ROLE_DOCK_TABS: Record<
  UserRole,
  { left: [RoleDockTabSpec, RoleDockTabSpec]; right: [RoleDockTabSpec, RoleDockTabSpec] }
> = {
  guardian: {
    left: [
      { id: 'overview', label: 'Tracking', iconKey: 'overview' },
      { id: 'routes', label: 'Route ETA', iconKey: 'routes' },
    ],
    right: [
      { id: 'alerts', label: 'Alerts', iconKey: 'alerts', showUnreadBadge: true },
      { id: 'profile', label: 'Account', iconKey: 'profile' },
    ],
  },
  driver: {
    left: [
      { id: 'overview', label: 'Cockpit', iconKey: 'overview' },
      { id: 'stops', label: 'Stops', iconKey: 'stops' },
    ],
    right: [
      { id: 'alerts', label: 'Trip Log', iconKey: 'alerts', showUnreadBadge: true },
      { id: 'profile', label: 'Driver ID', iconKey: 'profile' },
    ],
  },
  student: {
    left: [
      { id: 'overview', label: 'My Bus', iconKey: 'overview' },
      { id: 'pass', label: 'ID Pass', iconKey: 'pass' },
    ],
    right: [
      { id: 'alerts', label: 'Alerts', iconKey: 'alerts', showUnreadBadge: true },
      { id: 'map', label: 'Live Map', iconKey: 'map' },
    ],
  },
  admin: {
    left: [
      { id: 'overview', label: 'Dispatch', iconKey: 'overview' },
      { id: 'roster', label: 'Roster', iconKey: 'roster' },
    ],
    right: [
      { id: 'alerts', label: 'Alerts', iconKey: 'alerts', showUnreadBadge: true },
      { id: 'settings', label: 'Rules', iconKey: 'settings' },
    ],
  },
};

export function getRoleSectionMeta(role: UserRole): RoleSectionMeta {
  return ROLE_META[role] || ROLE_META.guardian;
}

export function getDockTabsForRole(role: UserRole) {
  return ROLE_DOCK_TABS[role] || ROLE_DOCK_TABS.guardian;
}

export function getAllowedTabsForRole(role: UserRole): SectionTabId[] {
  const spec = getDockTabsForRole(role);
  return [spec.left[0].id, spec.left[1].id, spec.right[0].id, spec.right[1].id];
}

export function normalizeTabForRole(role: UserRole, candidateTab: string): SectionTabId {
  const allowed = getAllowedTabsForRole(role);
  if (allowed.includes(candidateTab as SectionTabId)) {
    return candidateTab as SectionTabId;
  }

  // Legacy aliases across earlier builds
  if (candidateTab === 'home' || candidateTab === 'journey' || candidateTab === 'fleet') {
    return 'overview';
  }
  if (candidateTab === 'notifications' || candidateTab === 'history') {
    return 'alerts';
  }
  if (candidateTab === 'profile' && role === 'student') {
    return 'pass';
  }
  if (candidateTab === 'profile' && role === 'admin') {
    return 'settings';
  }

  return allowed[0];
}
