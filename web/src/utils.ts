import type { Priority } from './types';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function initials(name: string): string {
  const clean = name.replace(/^agent:/, '');
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Deterministic pleasant hue per person/agent name. */
export function hueFrom(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }
  return Math.round((hash / 997) * 360);
}

export const isAgent = (name: string) => name.toLowerCase().startsWith('agent');

export const PRIORITIES: Array<{ value: Priority; label: string; color: string }> = [
  { value: 'low', label: 'Low', color: '#64748b' },
  { value: 'medium', label: 'Medium', color: '#0284c7' },
  { value: 'high', label: 'High', color: '#d97706' },
  { value: 'urgent', label: 'Urgent', color: '#dc2626' },
];

export const priorityMeta = (priority: Priority) =>
  PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[1];
