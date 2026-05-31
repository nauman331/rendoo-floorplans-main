/**
 * Stage 06: Mood/Style System
 *
 * 4 mood presets with swappable design tokens.
 * IMPORTANT: Moods are styling/appearance; NOT geometry (unit types).
 *
 * Moods:
 * - Warm: Beige, terracotta, natural light
 * - Brown: Deep browns, sophisticated, earthy
 * - Moody: Dark greys, charcoal, modern
 * - Scandi: Light, minimal, Scandinavian design
 */

export type MoodType = 'warm' | 'brown' | 'moody' | 'scandi';

export interface MoodTokens {
    // Color palette
    colors: {
        primary: string; // Main wall/background color
        secondary: string; // Accent color
        walls: string; // Wall finish color
        furniture: string; // Furniture color hint
        doors: string; // Door color
        windows: string; // Window frame/glass color
        accents: string; // Highlight color
        text: string; // Text color for readability
    };

    // Furniture styling tokens
    furniture: {
        kitchenStyle: 'modern' | 'traditional' | 'minimalist';
        bathroomStyle: 'spa' | 'functional' | 'luxury';
        flooring: string; // Flooring pattern/color description
    };

    // Lighting/mood
    lighting: {
        brightness: number; // 0-100 brightness adjustment
        warmth: number; // Color temperature (-50 = cool blue, 0 = neutral, 50 = warm)
        contrast: number; // -50 to 50 contrast adjustment
    };

    // Typography
    typography: {
        fontFamily: string;
        fontSize: number; // Base font size in px
        labelColor: string; // Unit label color
    };

    // Metadata
    name: string;
    description: string;
}

/**
 * Mood palette definitions
 */
export const MOOD_PALETTES: Record<MoodType, MoodTokens> = {
    warm: {
        colors: {
            primary: '#F5E6D3',
            secondary: '#E8B4A0',
            walls: '#FAF3ED',
            furniture: '#C4956B',
            doors: '#8B6F47',
            windows: '#E8D4C0',
            accents: '#D2691E',
            text: '#4A3728',
        },
        furniture: {
            kitchenStyle: 'traditional',
            bathroomStyle: 'spa',
            flooring: 'warm wood',
        },
        lighting: {
            brightness: 85,
            warmth: 35,
            contrast: 5,
        },
        typography: {
            fontFamily: "'Georgia', serif",
            fontSize: 14,
            labelColor: '#8B6F47',
        },
        name: 'Warm',
        description: 'Cozy, natural light with terracotta accents',
    },

    brown: {
        colors: {
            primary: '#3E2723',
            secondary: '#795548',
            walls: '#4E342E',
            furniture: '#5D4037',
            doors: '#33251E',
            windows: '#6D4C41',
            accents: '#8D6E63',
            text: '#F5DEB3',
        },
        furniture: {
            kitchenStyle: 'traditional',
            bathroomStyle: 'luxury',
            flooring: 'dark hardwood',
        },
        lighting: {
            brightness: 65,
            warmth: 25,
            contrast: 15,
        },
        typography: {
            fontFamily: "'Times New Roman', serif",
            fontSize: 13,
            labelColor: '#D7CCC8',
        },
        name: 'Brown',
        description: 'Sophisticated, warm earth tones',
    },

    moody: {
        colors: {
            primary: '#212121',
            secondary: '#616161',
            walls: '#303030',
            furniture: '#424242',
            doors: '#1A1A1A',
            windows: '#757575',
            accents: '#90CAF9',
            text: '#ECEFF1',
        },
        furniture: {
            kitchenStyle: 'modern',
            bathroomStyle: 'functional',
            flooring: 'concrete grey',
        },
        lighting: {
            brightness: 55,
            warmth: -15,
            contrast: 25,
        },
        typography: {
            fontFamily: "'Helvetica', sans-serif",
            fontSize: 13,
            labelColor: '#BDBDBD',
        },
        name: 'Moody',
        description: 'Modern, contemporary dark aesthetic',
    },

    scandi: {
        colors: {
            primary: '#F8F9FA',
            secondary: '#E9ECEF',
            walls: '#FFFFFF',
            furniture: '#ADB5BD',
            doors: '#DEE2E6',
            windows: '#E9ECEF',
            accents: '#495057',
            text: '#212529',
        },
        furniture: {
            kitchenStyle: 'minimalist',
            bathroomStyle: 'functional',
            flooring: 'light wood',
        },
        lighting: {
            brightness: 95,
            warmth: -5,
            contrast: -10,
        },
        typography: {
            fontFamily: "'Open Sans', sans-serif",
            fontSize: 14,
            labelColor: '#495057',
        },
        name: 'Scandi',
        description: 'Light, minimal, Scandinavian simplicity',
    },
};

/**
 * Get tokens for a specific mood
 */
export function getMoodTokens(mood: MoodType | string): MoodTokens {
    const validMood = mood as MoodType;
    return MOOD_PALETTES[validMood] || MOOD_PALETTES.warm;
}

/**
 * Apply mood tokens to SVG/CSS
 * Generates CSS variables that can be used in rendering
 */
export function generateMoodCSS(mood: MoodType | string): string {
    const tokens = getMoodTokens(mood);
    return `
    :root {
      /* Colors */
      --mood-primary: ${tokens.colors.primary};
      --mood-secondary: ${tokens.colors.secondary};
      --mood-walls: ${tokens.colors.walls};
      --mood-furniture: ${tokens.colors.furniture};
      --mood-doors: ${tokens.colors.doors};
      --mood-windows: ${tokens.colors.windows};
      --mood-accents: ${tokens.colors.accents};
      --mood-text: ${tokens.colors.text};

      /* Lighting */
      --mood-brightness: ${tokens.lighting.brightness}%;
      --mood-warmth: ${tokens.lighting.warmth};
      --mood-contrast: ${tokens.lighting.contrast};

      /* Typography */
      --mood-font-family: ${tokens.typography.fontFamily};
      --mood-font-size: ${tokens.typography.fontSize}px;
      --mood-label-color: ${tokens.typography.labelColor};
    }
  `;
}

/**
 * Apply mood tokens to SVG content
 * Replaces placeholder tokens with mood-specific values
 */
export function applyMoodTokensToSVG(svgContent: string, mood: MoodType | string): string {
    const tokens = getMoodTokens(mood);

    let result = svgContent;

    // Replace color tokens
    result = result.replace(/{{mood\.primary}}/g, tokens.colors.primary);
    result = result.replace(/{{mood\.secondary}}/g, tokens.colors.secondary);
    result = result.replace(/{{mood\.walls}}/g, tokens.colors.walls);
    result = result.replace(/{{mood\.furniture}}/g, tokens.colors.furniture);
    result = result.replace(/{{mood\.doors}}/g, tokens.colors.doors);
    result = result.replace(/{{mood\.windows}}/g, tokens.colors.windows);
    result = result.replace(/{{mood\.accents}}/g, tokens.colors.accents);
    result = result.replace(/{{mood\.text}}/g, tokens.colors.text);

    // Replace lighting adjustments (CSS filter)
    const brightnessPercent = tokens.lighting.brightness;
    const warmthShift = tokens.lighting.warmth;
    const contrastShift = tokens.lighting.contrast;

    const filterValue = `brightness(${brightnessPercent}%) contrast(${100 + contrastShift}%)`;
    result = result.replace(/{{mood\.filter}}/g, filterValue);

    return result;
}

/**
 * Generate a mood-themed SVG filter for rendering
 * Can be included in SVG <defs> section
 */
export function generateMoodSVGFilter(mood: MoodType | string, filterId: string = 'moodFilter'): string {
    const tokens = getMoodTokens(mood);

    // Convert warmth (-50 to 50) to color matrix adjustment
    const warmthFactor = tokens.lighting.warmth / 50; // -1 to 1

    // Simplified color matrix for warmth: increase red/yellow, decrease blue
    const rShift = 1 + warmthFactor * 0.1;
    const gShift = 1 + warmthFactor * 0.05;
    const bShift = 1 - warmthFactor * 0.1;

    return `
    <defs>
      <filter id="${filterId}">
        <feColorMatrix
          type="matrix"
          values="${rShift} 0 0 0 0
                   0 ${gShift} 0 0 0
                   0 0 ${bShift} 0 0
                   0 0 0 1 0"
        />
        <feComponentTransfer>
          <feFuncA type="linear" slope="1"/>
        </feComponentTransfer>
      </filter>
    </defs>
  `;
}

/**
 * List all available moods
 */
export function getAvailableMoods(): Array<{ id: MoodType; name: string; description: string }> {
    return Object.entries(MOOD_PALETTES).map(([id, tokens]) => ({
        id: id as MoodType,
        name: tokens.name,
        description: tokens.description,
    }));
}

/**
 * Get contrast between two colors (simplified)
 * Used to ensure labels remain readable on mood backgrounds
 */
export function getContrastColor(moodType: MoodType | string, useLight: boolean = true): string {
    const tokens = getMoodTokens(moodType);
    const bgBrightness = tokens.lighting.brightness;

    // If background is bright, use dark text; if dark, use light text
    if (bgBrightness > 50) {
        return tokens.colors.text;
    } else {
        return '#FFFFFF';
    }
}
