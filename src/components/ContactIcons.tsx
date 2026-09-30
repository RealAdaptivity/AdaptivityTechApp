import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

type IconProps = { size?: number; color: string };

/** Line icons for the Call / Text / Navigate row, drawn to match each other. */

export const PhoneIcon: React.FC<IconProps> = ({ size = 22, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6.6 3.5h2.2c.5 0 .9.3 1 .8l.8 3.4c.1.4 0 .8-.3 1.1L8.6 10.5a12 12 0 0 0 4.9 4.9l1.7-1.7c.3-.3.7-.4 1.1-.3l3.4.8c.5.1.8.5.8 1v2.2c0 1.1-.9 2.1-2.1 2A16.5 16.5 0 0 1 4.6 5.6c-.1-1.2.9-2.1 2-2.1Z"
      stroke={color}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
  </Svg>
);

export const MessageIcon: React.FC<IconProps> = ({ size = 22, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.2c-.5.4-1.3 0-1.3-.6V17h0A2.5 2.5 0 0 1 4 14.5v-8Z"
      stroke={color}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
    <Circle cx={8.5} cy={10.5} r={1.1} fill={color} />
    <Circle cx={12} cy={10.5} r={1.1} fill={color} />
    <Circle cx={15.5} cy={10.5} r={1.1} fill={color} />
  </Svg>
);

export const NavigateIcon: React.FC<IconProps> = ({ size = 22, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20.2 3.8 3.9 10.6c-.6.3-.6 1.2.1 1.4l6.4 1.6 1.6 6.4c.2.7 1.1.7 1.4.1l6.8-16.3Z"
      stroke={color}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
  </Svg>
);
