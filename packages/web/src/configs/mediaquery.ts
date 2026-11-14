export const mediaquery = {
  xs: "(min-width: 480px)",
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  xxl: "(min-width: 1536px)",
} as const;

export type Breakpoint = keyof typeof mediaquery;
