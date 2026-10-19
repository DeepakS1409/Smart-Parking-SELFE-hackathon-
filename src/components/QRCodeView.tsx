import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { toQR } from 'toqr';

interface QRCodeViewProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  quietZone?: number;
}

/**
 * Pure React Native QR Code Component
 * Uses the lightweight 'toqr' encoder to generate an exact, camera-scannable QR matrix.
 */
export function QRCodeView({
  value,
  size = 180,
  color = '#000000',
  backgroundColor = '#FFFFFF',
  quietZone = 8,
}: QRCodeViewProps) {
  const { matrix, matrixSize } = useMemo(() => {
    try {
      const qrBytes = toQR(value);
      const mSize = Math.round(Math.sqrt(qrBytes.length));
      const rows: number[][] = [];
      for (let y = 0; y < mSize; y++) {
        const row: number[] = [];
        for (let x = 0; x < mSize; x++) {
          row.push(qrBytes[y * mSize + x]);
        }
        rows.push(row);
      }
      return { matrix: rows, matrixSize: mSize };
    } catch (err) {
      console.warn('Failed to encode QR matrix:', err);
      return { matrix: [], matrixSize: 0 };
    }
  }, [value]);

  if (matrixSize === 0) {
    return null;
  }

  // Exact cell size
  const cellSize = Math.floor((size - quietZone * 2) / matrixSize);
  const adjustedTotalSize = cellSize * matrixSize + quietZone * 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: adjustedTotalSize,
          height: adjustedTotalSize,
          backgroundColor,
          padding: quietZone,
        },
      ]}
    >
      {matrix.map((row, rIdx) => (
        <View key={`r-${rIdx}`} style={[styles.row, { height: cellSize }]}>
          {row.map((cell, cIdx) => (
            <View
              key={`c-${cIdx}`}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: cell === 1 ? color : backgroundColor,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
});
