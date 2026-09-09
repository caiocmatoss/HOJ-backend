export const PUBLIC_USER_SELECT = {
  id: true, name: true, username: true, city: true, avatar: true, bio: true,
  status: true, lastSeenAt: true,
  privacyPreferences: { select: { showStatus: true, showLastSeen: true } },
} as const;
export const SELF_USER_SELECT = { ...PUBLIC_USER_SELECT, email: true, phone: true, emailVerifiedAt: true } as const;