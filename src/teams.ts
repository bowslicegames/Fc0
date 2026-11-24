import type { KitConfig } from './entities/footballer';

export interface TeamPlayer {
  name: string;
  number: number;
  role: 'ST' | 'LW' | 'RW' | 'CM' | 'CB';
  skin: string;
  hair: string;
  hairStyle: 'short' | 'buzz' | 'curly' | 'fade';
  heightScale: number;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  rating: number;
  kit: {
    shirt: string;
    trim: string;
    shorts: string;
    socks: string;
    boots: string;
  };
  players: TeamPlayer[];
}

/**
 * Squads are ordered to match the formation anchors in main.ts:
 * striker (controlled at kick-off), left wing, right wing, centre mid, centre back.
 */
export const TEAMS: Team[] = [
  {
    id: 'ultimate',
    name: 'ULTIMATE XI',
    code: 'ULT',
    rating: 84,
    kit: {
      shirt: '#f4f8fb',
      trim: '#0b7f88',
      shorts: '#0d2c3d',
      socks: '#f4f8fb',
      boots: '#ff5a1f',
    },
    players: [
      { name: 'VEGA', number: 10, role: 'ST', skin: '#c98a63', hair: '#20150e', hairStyle: 'short', heightScale: 1 },
      { name: 'OKAFOR', number: 7, role: 'LW', skin: '#6b4630', hair: '#0e0b09', hairStyle: 'curly', heightScale: 1.04 },
      { name: 'SANTOS', number: 11, role: 'RW', skin: '#a9724c', hair: '#160f0a', hairStyle: 'short', heightScale: 0.95 },
      { name: 'KIM', number: 8, role: 'CM', skin: '#e8c2a0', hair: '#0c0b0a', hairStyle: 'buzz', heightScale: 0.99 },
      { name: 'LARSEN', number: 4, role: 'CB', skin: '#efc8a4', hair: '#c9a15c', hairStyle: 'fade', heightScale: 1.06 },
    ],
  },
  {
    id: 'crimson',
    name: 'CRIMSON FC',
    code: 'CRM',
    rating: 82,
    kit: {
      shirt: '#c0202c',
      trim: '#f7e9cf',
      shorts: '#f7e9cf',
      socks: '#c0202c',
      boots: '#ffd23f',
    },
    players: [
      { name: 'DIABY', number: 9, role: 'ST', skin: '#5a3a26', hair: '#100c09', hairStyle: 'fade', heightScale: 1.03 },
      { name: 'MOREL', number: 6, role: 'LW', skin: '#efc7a2', hair: '#3a2416', hairStyle: 'short', heightScale: 1 },
      { name: 'TORRES', number: 5, role: 'RW', skin: '#c98a63', hair: '#161009', hairStyle: 'curly', heightScale: 0.96 },
      { name: 'BRUNO', number: 8, role: 'CM', skin: '#e5bb95', hair: '#20140d', hairStyle: 'buzz', heightScale: 1.01 },
      { name: 'HAKIM', number: 2, role: 'CB', skin: '#8a5a3c', hair: '#0d0a08', hairStyle: 'short', heightScale: 1.05 },
    ],
  },
  {
    id: 'volt',
    name: 'VOLT UNITED',
    code: 'VLT',
    rating: 81,
    kit: {
      shirt: '#1b2430',
      trim: '#d8ff3e',
      shorts: '#d8ff3e',
      socks: '#1b2430',
      boots: '#f4f8fb',
    },
    players: [
      { name: 'RUIZ', number: 7, role: 'ST', skin: '#d39a6f', hair: '#1a1109', hairStyle: 'short', heightScale: 0.98 },
      { name: 'ADEYEMI', number: 3, role: 'LW', skin: '#6b4630', hair: '#0b0908', hairStyle: 'fade', heightScale: 1.02 },
      { name: 'NAKAMURA', number: 14, role: 'RW', skin: '#ecc9a6', hair: '#0c0b0a', hairStyle: 'buzz', heightScale: 0.94 },
      { name: 'KOVAC', number: 10, role: 'CM', skin: '#efc8a4', hair: '#6b4a2a', hairStyle: 'short', heightScale: 1.05 },
      { name: 'SILVA', number: 9, role: 'CB', skin: '#a9724c', hair: '#120d09', hairStyle: 'curly', heightScale: 1 },
    ],
  },
  {
    id: 'nordic',
    name: 'NORDIC BLUE',
    code: 'NRD',
    rating: 83,
    kit: {
      shirt: '#1e4fd8',
      trim: '#f2f7ff',
      shorts: '#f2f7ff',
      socks: '#1e4fd8',
      boots: '#ffffff',
    },
    players: [
      { name: 'BERG', number: 4, role: 'ST', skin: '#f0cdae', hair: '#d8b06a', hairStyle: 'fade', heightScale: 1.06 },
      { name: 'LIND', number: 11, role: 'LW', skin: '#e8c2a0', hair: '#8a6a3a', hairStyle: 'short', heightScale: 1 },
      { name: 'HOLM', number: 8, role: 'RW', skin: '#efc8a4', hair: '#3b2a1a', hairStyle: 'buzz', heightScale: 0.97 },
      { name: 'VOSS', number: 6, role: 'CM', skin: '#dfae86', hair: '#241810', hairStyle: 'short', heightScale: 1.03 },
      { name: 'ERIK', number: 2, role: 'CB', skin: '#f2d3b4', hair: '#c9a15c', hairStyle: 'curly', heightScale: 1.05 },
    ],
  },
];

export function squadKits(team: Team): KitConfig[] {
  return team.players.map((p) => ({
    shirt: team.kit.shirt,
    accent: team.kit.trim,
    shorts: team.kit.shorts,
    socks: team.kit.socks,
    boots: team.kit.boots,
    skin: p.skin,
    hair: p.hair,
    number: p.number,
    name: p.name,
    hairStyle: p.hairStyle,
    heightScale: p.heightScale,
  }));
}
