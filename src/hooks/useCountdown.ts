"use client";

import { useState, useEffect } from 'react';

export function useCountdown(endDate: string | null | undefined): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!endDate) {
      setLabel('');
      return;
    }

    const ts = Date.parse(endDate);
    if (Number.isNaN(ts)) {
      setLabel('');
      return;
    }

    const calculate = () => {
      const diff = ts - Date.now();
      if (diff <= 0) {
        setLabel('Ended');
        return;
      }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);

      if (d > 0) setLabel(`${d}d ${h}h`);
      else if (h > 0) setLabel(`${h}h ${m}m`);
      else setLabel(`${m}m`);
    };

    calculate();
    const id = setInterval(calculate, 60_000);
    return () => clearInterval(id);
  }, [endDate]);

  return label;
}
