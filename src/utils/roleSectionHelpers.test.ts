import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDockTabsForRole,
  getRoleSectionMeta,
  normalizeTabForRole,
} from './roleSectionHelpers';
import { UserRole } from '../types';

test('each primary role exposes distinct section title and badge', () => {
  const roles: UserRole[] = ['guardian', 'driver', 'student', 'admin'];
  const titles = roles.map((r) => getRoleSectionMeta(r).sectionTitle);
  const badges = roles.map((r) => getRoleSectionMeta(r).badgeLabel);

  assert.equal(new Set(titles).size, 4);
  assert.equal(new Set(badges).size, 4);
  assert.equal(getRoleSectionMeta('guardian').sectionTitle, 'Parent Portal');
  assert.equal(getRoleSectionMeta('driver').sectionTitle, 'Driver Cockpit');
  assert.equal(getRoleSectionMeta('student').sectionTitle, 'Student Bus Pass');
  assert.equal(getRoleSectionMeta('admin').sectionTitle, 'Dispatch Console');
});

test('dock tabs are role-tailored while preserving 2 left + 2 right structure', () => {
  const parentTabs = getDockTabsForRole('guardian');
  const driverTabs = getDockTabsForRole('driver');
  const studentTabs = getDockTabsForRole('student');

  assert.deepEqual(
    [...parentTabs.left, ...parentTabs.right].map((t) => t.label),
    ['Tracking', 'Route ETA', 'Alerts', 'Account']
  );
  assert.deepEqual(
    [...driverTabs.left, ...driverTabs.right].map((t) => t.label),
    ['Cockpit', 'Stops', 'Trip Log', 'Driver ID']
  );
  assert.deepEqual(
    [...studentTabs.left, ...studentTabs.right].map((t) => t.label),
    ['My Bus', 'ID Pass', 'Alerts', 'Live Map']
  );
});

test('normalizeTabForRole falls back safely when switching roles', () => {
  // Driver "stops" tab does not exist in Student or Parent -> maps to overview
  assert.equal(normalizeTabForRole('student', 'stops'), 'overview');
  assert.equal(normalizeTabForRole('guardian', 'stops'), 'overview');

  // Legacy "notifications" alias maps to "alerts"
  assert.equal(normalizeTabForRole('guardian', 'notifications'), 'alerts');
  assert.equal(normalizeTabForRole('driver', 'history'), 'alerts');

  // Legacy "profile" on Student maps to "pass" (Digital ID Pass)
  assert.equal(normalizeTabForRole('student', 'profile'), 'pass');

  // Valid tabs are preserved verbatim
  assert.equal(normalizeTabForRole('driver', 'stops'), 'stops');
  assert.equal(normalizeTabForRole('guardian', 'routes'), 'routes');
  assert.equal(normalizeTabForRole('admin', 'roster'), 'roster');
});
