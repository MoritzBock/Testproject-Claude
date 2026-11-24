import { describe, expect, it } from 'vitest';
import { integerZoom } from './scale';

describe('integerZoom', () => {
  it('picks the largest integer factor that fits', () => {
    expect(integerZoom(1920, 1080, 480, 270)).toBe(4);
    expect(integerZoom(1366, 768, 480, 270)).toBe(2);
  });
  it('never goes below 1', () => {
    expect(integerZoom(320, 200, 480, 270)).toBe(1);
  });
});
