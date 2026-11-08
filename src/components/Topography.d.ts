import type { CSSProperties } from 'react';

export type TopographyProps = {
  color?: string;
  lineCount?: number;
  lineWidth?: number;
  majorLines?: boolean;
  elevation?: number;
  foreground?: number;
  scale?: number;
  detail?: number;
  tilt?: number;
  speed?: number;
  direction?: 'forward' | 'backward' | 'left' | 'right';
  morph?: number;
  glow?: number;
  depthOfField?: number;
  fog?: number;
  brightness?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  hoverEffect?: 'lift' | 'trace' | 'light';
  mouseRadius?: number;
  mouseStrength?: number;
  trail?: number;
  parallax?: number;
  clickEffect?: 'pulse' | 'peak' | 'none';
  markers?: 'none' | 'plus' | 'dots';
  glitch?: number;
  intro?: boolean;
  lightMode?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
};

declare function Topography(props: TopographyProps): JSX.Element;
export default Topography;
