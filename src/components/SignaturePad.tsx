import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { colors, borderRadius } from '../theme/colors';

export type SignaturePadHandle = {
  /** Writes the drawn signature to a temporary PNG and returns its file URI. */
  toPngFile: () => Promise<string>;
  clear: () => void;
};

type Props = {
  disabled?: boolean;
  height?: number;
  onChange?: (hasStroke: boolean) => void;
  /** Lets a parent ScrollView stop scrolling while the finger is on the pad. */
  onDrawingChange?: (drawing: boolean) => void;
};

/**
 * Finger signature pad. Strokes are drawn as SVG paths on a white card, then
 * captured to PNG — the same image format the web portal uploads, so staff see
 * one kind of signature whichever device it came from.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ disabled, height = 170, onChange, onDrawingChange }, ref) => {
    const canvasRef = useRef<View>(null);
    const [paths, setPaths] = useState<string[]>([]);
    const current = useRef('');
    const [, force] = useState(0);
    const disabledRef = useRef(disabled);
    disabledRef.current = disabled;
    // The responder is created once, so it reads the latest callbacks via refs.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onDrawingRef = useRef(onDrawingChange);
    onDrawingRef.current = onDrawingChange;

    const responder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          onDrawingRef.current?.(true);
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          current.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
          force((n) => n + 1);
        },
        onPanResponderRelease: () => finishStroke(),
        onPanResponderTerminate: () => finishStroke(),
      })
    ).current;

    function finishStroke() {
      const stroke = current.current;
      current.current = '';
      onDrawingRef.current?.(false);
      if (!stroke) return;
      // A tap with no movement still leaves a visible dot.
      const drawn = stroke.includes('L') ? stroke : `${stroke} l0.1,0.1`;
      setPaths((prev) => [...prev, drawn]);
      onChangeRef.current?.(true);
    }

    const clear = () => {
      current.current = '';
      setPaths([]);
      onChange?.(false);
    };

    useImperativeHandle(ref, () => ({
      clear,
      toPngFile: async () => {
        if (!canvasRef.current) throw new Error('Signature pad is not ready');
        return captureRef(canvasRef, { format: 'png', quality: 1, result: 'tmpfile' });
      },
    }));

    const all = current.current ? [...paths, current.current] : paths;

    return (
      <View>
        <View
          ref={canvasRef}
          collapsable={false}
          style={[styles.canvas, { height }, disabled && styles.disabled]}
          {...responder.panHandlers}
        >
          <Svg width="100%" height="100%">
            {all.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke="#0f1218"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
          {all.length === 0 && (
            <Text style={styles.placeholder} pointerEvents="none">
              {disabled ? 'Locked' : 'Sign here with your finger'}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={clear} disabled={disabled} style={styles.clearBtn}>
          <Text style={styles.clearText}>Clear signature</Text>
        </TouchableOpacity>
      </View>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  disabled: { opacity: 0.4 },
  placeholder: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    color: '#94a3b8',
    fontSize: 12,
  },
  clearBtn: { alignSelf: 'flex-end', paddingVertical: 6 },
  clearText: { color: colors.brand.orange, fontSize: 12, fontWeight: '700' },
});
