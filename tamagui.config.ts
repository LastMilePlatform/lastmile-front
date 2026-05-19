import { createTamagui, createTokens } from '@tamagui/core';

const tokens = createTokens({
  size: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
  },
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
  },
  radius: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
  },
  zIndex: {
    0: 0,
    1: 10,
    2: 20,
    3: 30,
    4: 40,
  },
  color: {
    background: '#f4f7f2',
    text: '#13201a',
    primary: '#22a45d',
    primarySoft: '#d9f7e6',
    border: '#b9c7be',
  },
});

const config = createTamagui({
  tokens,
  themes: {
    light: {
      background: tokens.color.background,
      color: tokens.color.text,
      borderColor: tokens.color.border,
      primary: tokens.color.primary,
    },
  },
  defaultTheme: 'light',
});

export default config;

export type AppTamaguiConfig = typeof config;

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}