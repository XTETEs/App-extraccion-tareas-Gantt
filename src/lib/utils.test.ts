import { describe, it, expect } from 'vitest';
import { stringToColor } from './utils';

describe('stringToColor', () => {
    it('should consistently generate the same color for the same string', () => {
        const str = 'test-string';
        const color1 = stringToColor(str);
        const color2 = stringToColor(str);
        expect(color1).toBe(color2);
    });

    it('should generate different colors for different strings', () => {
        const color1 = stringToColor('test-string-1');
        const color2 = stringToColor('test-string-2');
        expect(color1).not.toBe(color2);
    });

    it('should use default saturation and lightness', () => {
        const color = stringToColor('test');
        expect(color).toMatch(/hsl\(\d+, 65%, 50%\)/);
    });

    it('should apply custom saturation and lightness', () => {
        const color = stringToColor('test', 80, 40);
        expect(color).toMatch(/hsl\(\d+, 80%, 40%\)/);
    });

    it('should handle empty string', () => {
        const color = stringToColor('');
        expect(color).toMatch(/hsl\(0, 65%, 50%\)/);
    });
});
