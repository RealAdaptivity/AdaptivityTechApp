import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { create } from 'qrcode';

/** A QR code drawn with react-native-svg: dark modules on a white quiet zone
 *  so any phone camera or bank app can scan it off the screen. */
export const QrCode: React.FC<{ value: string; size: number }> = ({ value, size }) => {
  const { path, count } = useMemo(() => {
    const qr = create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);
  const quiet = 4;
  const box = count + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`}>
      <Rect x={-quiet} y={-quiet} width={box} height={box} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
};
