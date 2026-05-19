export const USER_ROLES = ['organizer', 'volunteer', 'donor'] as const;

export type UserRole = (typeof USER_ROLES)[number];