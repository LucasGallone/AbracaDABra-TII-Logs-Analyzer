import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sortChannels(aChannel: string, bChannel: string): number {
  const aMatch = aChannel.match(/(\d+)([a-zA-Z]*)/);
  const bMatch = bChannel.match(/(\d+)([a-zA-Z]*)/);

  if (aMatch && bMatch) {
    const aNum = parseInt(aMatch[1], 10);
    const bNum = parseInt(bMatch[1], 10);
    if (aNum !== bNum) return aNum - bNum;
    return (aMatch[2] || '').localeCompare(bMatch[2] || '');
  }
  
  return aChannel.localeCompare(bChannel);
}
