
"use client";

import React from 'react';
import { useDeriv } from '@/components/deriv-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Zap } from 'lucide-react';

export function MarketSelector() {
  const { markets, selectedSymbol, setSelectedSymbol } = useDeriv();

  const displayMarkets = (markets || []).filter(m => m && m.symbol);
  const selectedMarket = displayMarkets.find(m => m.symbol === selectedSymbol);
  const selectedLabel =
    selectedMarket?.display_name ||
    (selectedSymbol ? selectedSymbol.replace('R_', 'VOL ') : 'Market');

  return (
    <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
      <LineChart className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary shrink-0" />
      <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
        <SelectTrigger className="w-[140px] sm:w-[165px] h-9 bg-background border-white/10 font-semibold px-2.5 text-xs">
          <SelectValue placeholder="Market">
            <span className="block truncate whitespace-nowrap text-left">{selectedLabel}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {displayMarkets.length > 0 ? (
            displayMarkets.map((market) => (
              <SelectItem key={market.symbol} value={market.symbol} className="text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-3 h-3 text-accent shrink-0" />
                  <span className="truncate whitespace-nowrap">
                    {market.display_name || (market.symbol ? market.symbol.replace('R_', 'VOL ') : 'N/A')}
                  </span>
                </div>
              </SelectItem>
            ))
          ) : (
            <SelectItem value="loading" disabled className="text-[10px] uppercase font-bold italic opacity-50">
              Syncing Indices...
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
