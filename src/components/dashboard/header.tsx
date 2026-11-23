
"use client";

import React from 'react';
import { useDeriv } from '@/components/deriv-provider';
import { MarketSelector } from './market-selector';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Zap, ShieldCheck, RefreshCw, Timer } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { authState, logout, switchAccount, isReconnecting, networkGlitch, refreshCountdown } = useDeriv();
  const activeAccount = authState.accounts[authState.activeAccountIndex];
  const isVirtualAccount = activeAccount?.is_virtual ?? Boolean(authState.isVirtual);
  const displayBalance = authState.balance ?? activeAccount?.balance ?? 0;
  const displayCurrency = authState.currency || activeAccount?.currency || 'USD';
  const formattedBalance = displayBalance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const renderAccountSelect = (triggerClassName: string) => (
    <Select
      value={authState.activeAccountIndex.toString()}
      onValueChange={(val) => switchAccount(parseInt(val, 10))}
    >
      <SelectTrigger
        aria-label="Switch trading account"
        className={triggerClassName}
      >
        <SelectValue placeholder="Account">
          {activeAccount ? (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  activeAccount.is_virtual ? "bg-orange-400" : "bg-green-500"
                )}
              />
              <span className="text-[10px] font-black uppercase tracking-wider opacity-75 shrink-0">
                {activeAccount.is_virtual ? 'Demo' : 'Real'}
              </span>
              <span className="text-muted-foreground/50 shrink-0" aria-hidden="true">·</span>
              <span className="font-code text-xs font-bold truncate">
                {activeAccount.account_id}
              </span>
            </div>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {authState.accounts.map((acc, idx) => (
          <SelectItem key={acc.account_id} value={idx.toString()}>
            <div className="flex items-center justify-between gap-4 min-w-[180px]">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    acc.is_virtual ? "bg-orange-400" : "bg-green-500"
                  )}
                />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[9px] font-black uppercase opacity-60 leading-none">
                    {acc.is_virtual ? 'Demo' : 'Real'}
                  </span>
                  <span className="font-code text-xs font-semibold truncate">
                    {acc.account_id}
                  </span>
                </div>
              </div>
              {typeof acc.balance === 'number' && !Number.isNaN(acc.balance) && (
                <span className="font-code tabular-nums text-[11px] font-bold text-muted-foreground shrink-0">
                  {acc.balance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  {acc.currency || 'USD'}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <header className="w-full border-b bg-card/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
      {/* Primary Top Row */}
      <div className="h-12 md:h-16 flex items-center justify-between gap-2 md:gap-4 px-3 md:px-6 lg:px-8">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <SidebarTrigger className="h-10 w-10 hover:bg-white/10 rounded-lg text-foreground shrink-0" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-primary rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20 shrink-0">
              <Zap className="w-4 h-4 md:w-6 md:h-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tight text-primary uppercase italic select-none hidden lg:block leading-none">
                Alchemist
              </h1>
              {networkGlitch && (
                <span className="text-[7px] font-black text-red-500 uppercase tracking-widest animate-pulse mt-1">
                  Handshake Stall Detected
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 lg:gap-5 min-w-0 justify-end">
          {refreshCountdown !== null && (
            <Badge variant="destructive" className="hidden sm:flex bg-red-500/20 text-red-500 border-red-500/30 text-[9px] font-black uppercase tracking-widest px-3 py-1 items-center gap-2 animate-in slide-in-from-top-2 shrink-0">
              <Timer className="w-3 h-3 animate-pulse" />
              Auto-Refresh in {refreshCountdown}s
            </Badge>
          )}

          {isReconnecting && !networkGlitch && (
            <Badge variant="outline" className="hidden sm:flex border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest px-3 py-1 items-center gap-2 shrink-0">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Syncing Link...
            </Badge>
          )}

          <MarketSelector />

          {/* Desktop Account Switcher */}
          {authState.accounts.length > 0 && (
            <div className="hidden md:block shrink-0">
              {renderAccountSelect(
                "w-[165px] lg:w-[190px] h-10 text-xs font-bold bg-white/5 border-white/10 text-foreground px-2.5"
              )}
            </div>
          )}

          {/* Desktop Balance + Avatar */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="text-right flex flex-col">
              <div className="flex items-center gap-1 justify-end">
                <ShieldCheck className={cn("w-3 h-3", isVirtualAccount ? "text-orange-400" : "text-green-500")} />
                <span className={cn("text-[9px] font-black uppercase tracking-tighter whitespace-nowrap", isVirtualAccount ? "text-orange-400" : "text-green-500")}>
                  {isVirtualAccount ? 'Demo' : 'Real'} Account
                </span>
              </div>
              <p className="text-sm font-code tabular-nums font-black text-foreground tracking-tight whitespace-nowrap">
                {formattedBalance} <span className="text-[11px] font-bold text-muted-foreground">{displayCurrency}</span>
              </p>
            </div>
            <Avatar className="hidden lg:flex w-10 h-10 border-2 border-primary/20 ring-2 ring-background ring-offset-2 ring-offset-primary/20 shrink-0">
              <AvatarFallback className="bg-primary text-white font-bold text-[10px]">
                {isVirtualAccount ? 'DEMO' : 'REAL'}
              </AvatarFallback>
            </Avatar>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label="Sign out"
            className="h-10 w-10 hover:bg-red-500/10 hover:text-red-500 transition-all rounded-full shrink-0"
          >
            <LogOut className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Account Switch & Balance Strip */}
      <div className="flex md:hidden items-center justify-between gap-3 px-3 py-1.5 border-t border-white/5 bg-background/50">
        {authState.accounts.length > 0 ? (
          <div className="flex-1 min-w-0">
            {renderAccountSelect(
              "w-full h-10 text-xs font-bold bg-white/5 border-white/10 text-foreground px-2.5 rounded-lg"
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground min-w-0">
            <span className={cn("w-2 h-2 rounded-full shrink-0", isVirtualAccount ? "bg-orange-400" : "bg-green-500")} />
            <span className="truncate">{isVirtualAccount ? 'Demo Account' : 'Real Account'}</span>
          </div>
        )}

        <div className="shrink-0 flex flex-col items-end justify-center text-right">
          <div className="flex items-center gap-1 justify-end">
            <ShieldCheck className={cn("w-3 h-3 shrink-0", isVirtualAccount ? "text-orange-400" : "text-green-500")} />
            <span className={cn("text-[9px] font-black uppercase tracking-wider leading-none whitespace-nowrap", isVirtualAccount ? "text-orange-400" : "text-green-500")}>
              {isVirtualAccount ? 'Demo' : 'Real'} Balance
            </span>
          </div>
          <p className="text-sm font-code tabular-nums font-black text-foreground tracking-tight leading-tight mt-0.5 whitespace-nowrap">
            {formattedBalance}{' '}
            <span className="text-[10px] font-bold text-muted-foreground">{displayCurrency}</span>
          </p>
        </div>
      </div>
    </header>
  );
}
