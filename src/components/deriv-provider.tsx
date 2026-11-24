
"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { MarketSymbol, Tick, AuthState, TradeHistoryItem, StrategyType, StrategyParams, ExecutionSettings, BalanceOverride, RobotId, DerivContextType, SessionProtocolSettings, HistoricalAnalysisResult, SavedToken, DiscoveredPattern } from '@/lib/deriv-types';
import { getDigit, getMarketPrecision, settleSimulatedTrade, calculateSimulationProfit } from '@/lib/simulation-engine';
import { toast } from "@/hooks/use-toast";

const DerivContext = createContext<DerivContextType | undefined>(undefined);

const FALLBACK_MARKETS: MarketSymbol[] = [
  { symbol: 'R_10', display_name: 'Volatility 10 Index', market_display_name: 'Synthetic Indices', submarket_display_name: 'Random Indices' },
  { symbol: 'R_25', display_name: 'Volatility 25 Index', market_display_name: 'Synthetic Indices', submarket_display_name: 'Random Indices' },
  { symbol: 'R_50', display_name: 'Volatility 50 Index', market_display_name: 'Synthetic Indices', submarket_display_name: 'Random Indices' },
  { symbol: 'R_75', display_name: 'Volatility 75 Index', market_display_name: 'Synthetic Indices', submarket_display_name: 'Random Indices' },
  { symbol: 'R_100', display_name: 'Volatility 100 Index', market_display_name: 'Synthetic Indices', submarket_display_name: 'Random Indices' },
];

const DEFAULT_STRATEGY_PARAMS: StrategyParams = { 
  overBarrier: '4', underBarrier: '5', matchDigit: '0', differDigit: '0', differStrategy: 'static', differDigitsToTrade: '1,7', differEntryTriggers: '1,5,7', continuityContract: 'even_odd', continuityStrategy: 'continuous', continuityPattern1: '', continuityDirection1: 'even', continuityPattern2: '', continuityDirection2: 'odd', matchStrategy: 'scanner', matchDigitsToTrade: '0', matchEntryDigits: '1,5,3,4', matchEntryCount: '1', aiMissingDigitsCount: '3', aiScannerMode: 'over_under', aiGreaterCount: '4', aiLesserCount: '3', magicMultiMarketEnabled: false, magicSelectedMarkets: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'], magicDominanceDiffThreshold: '0', isN3MasterEnabled: false, dexTickCount: '1000', dexAnalysisMode: 'even_odd', dexPatternMinLen: '2', dexPatternMaxLen: '4', dexTargetStreak: '5', dexMatchDigit: '0', dexDirection: 'even', dexBarrier: '4', dexMatchPeakDigits: '1'
};

const DEFAULT_EXECUTION_SETTINGS: ExecutionSettings = {
  stake: '0.35', ticks: '1', martingale: '2.1', takeProfit: '15', stopLoss: '30', maxMartingale: '10', virtualHook: '1', lossHook: '1', isVirtualHookEnabled: false, isLossHookEnabled: false, tradeOver: true, tradeUnder: true, consecutiveCount: '1', delayTicks: '0', virtualLoss: '0', tickSample: '100', digitsToAnalyze: '1', singleMartingale: false, isHedgeAdd_upEnabled: false, isAddUpEnabled: false, isAddUpBothEnabled: false, isPartialAddUpEnabled: false, addUpSteps: '4', addUpPercentage: '50', isDivideMartingaleEnabled: false, isStepMartingaleEnabled: false, divideMartingaleSteps: '2', entryDigits: '', continuityDiffThreshold: '0', isAutoMartingaleEnabled: false, isHunterCountEnabled: false, hunterCount: '3', isRecoveryDigitEnabled: false, overRecoveryBarrier: '4', underRecoveryBarrier: '5', isRecoveryBarrierEnabled: false, recoveryBarrierDirection: 'over', recoveryBarrierValue: '4'
};

const DEFAULT_SESSION_PROTOCOL: SessionProtocolSettings = {
  isSaveSettingsEnabled: false, isAutoRefreshEnabled: false, refreshInterval: '30', refreshUnit: 'min', cumulativeProfit: 0, cumulativeLoss: 0, sessionCount: 0, isDailyTargetEnabled: false, dailyTargetAmount: '10'
};

export function DerivProvider({ children }: { children: React.ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeRobotId, setActiveRobotId] = useState<RobotId>('calculation_dex');
  const [history, setHistory] = useState<TradeHistoryItem[]>([]);
  const [currentMartingaleLevel, setCurrentMartingaleLevel] = useState<number>(0);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('R_10');
  const [strategyType, setStrategyType] = useState<StrategyType>('even_odd');
  const [authState, setAuthState] = useState<AuthState>({ 
    isLoggedIn: false, isAdmin: false, accounts: [], activeAccountIndex: 0 
  });
  const [markets, setMarkets] = useState<MarketSymbol[]>(FALLBACK_MARKETS);
  const [currentTicks, setCurrentTicks] = useState<Tick[]>([]);
  const [strategyParams, setStrategyParams] = useState<StrategyParams>(DEFAULT_STRATEGY_PARAMS);
  const [executionSettings, setExecutionSettings] = useState<ExecutionSettings>(DEFAULT_EXECUTION_SETTINGS);
  const [sessionProtocol, setSessionProtocol] = useState<SessionProtocolSettings>(DEFAULT_SESSION_PROTOCOL);
  const [savedTokens, setSavedTokens] = useState<SavedToken[]>([]);
  
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [isBotEnabled, setIsBotEnabled] = useState(false);
  const [isHunterEnabled, setIsHunterEnabled] = useState(false);
  const [terminalMessage, setTerminalMessage] = useState<any>(null);

  const [historicalAnalysis, setHistoricalAnalysis] = useState<HistoricalAnalysisResult | null>(null);
  const [isAnalyzingDex, setIsAnalyzingDex] = useState(false);
  const [isMonitoringDex, setIsMonitoringDex] = useState(false);

  // Virtual Hook State Node
  const [consecutiveVirtualLosses, setConsecutiveVirtualLosses] = useState(0);
  const [isHuntingInReal, setIsHuntingInReal] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const settingsRef = useRef(executionSettings);
  const historyRef = useRef(history);
  const pendingTradesRef = useRef<TradeHistoryItem[]>([]);
  const patRef = useRef<string | null>(null);
  const selectedSymbolRef = useRef(selectedSymbol);
  const balanceRef = useRef(authState.balance || 0);
  const lastDigitMatchEpochRef = useRef<string | number | null>(null);
  const lastAiTradeEpochRef = useRef<string | number | null>(null);

  const getSessionToken = useCallback(() => {
    if (patRef.current) return patRef.current;
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('deriv_pat_session');
    }
    return null;
  }, []);

  const SAVED_PREFERENCES_KEY = 'deriv_saved_preferences';

  const writeSavedSettingsSnapshot = useCallback((overrides?: {
    auth?: AuthState;
    symbol?: string;
    robotId?: RobotId;
    stratType?: StrategyType;
    stratParams?: StrategyParams;
    execSettings?: ExecutionSettings;
    botEnabled?: boolean;
    hunterEnabled?: boolean;
  }) => {
    if (typeof window === 'undefined') return;
    const authSnapshot = overrides?.auth ?? authState;
    const activeAcc = authSnapshot.accounts[authSnapshot.activeAccountIndex];
    const stratParamsSnapshot = overrides?.stratParams ?? strategyParams;
    const execSnapshot = overrides?.execSettings ?? executionSettings;
    const prefs = {
      selectedSymbol: overrides?.symbol ?? selectedSymbol,
      activeRobotId: overrides?.robotId ?? activeRobotId,
      strategyType: overrides?.stratType ?? strategyType,
      strategyParams: stratParamsSnapshot,
      executionSettings: execSnapshot,
      isBotEnabled: overrides?.botEnabled ?? isBotEnabled,
      isHunterEnabled: overrides?.hunterEnabled ?? isHunterEnabled,
      activeAccountId: activeAcc?.account_id,
      activeAccountIndex: authSnapshot.activeAccountIndex,
      isVirtual: activeAcc?.is_virtual ?? authSnapshot.isVirtual,
    };
    localStorage.setItem('deriv_strategy', JSON.stringify(stratParamsSnapshot));
    localStorage.setItem('deriv_execution', JSON.stringify(execSnapshot));
    localStorage.setItem(SAVED_PREFERENCES_KEY, JSON.stringify(prefs));
  }, [authState, selectedSymbol, activeRobotId, strategyType, strategyParams, executionSettings, isBotEnabled, isHunterEnabled]);

  const clearSavedSettingsSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('deriv_strategy');
    localStorage.removeItem('deriv_execution');
    localStorage.removeItem(SAVED_PREFERENCES_KEY);
  }, []);

  // Function Declarations
  const switchAccount = useCallback(async (index: number) => {
    const acc = authState.accounts[index];
    if (acc) {
      const nextAuth: AuthState = {
        ...authState,
        activeAccountIndex: index,
        isVirtual: acc.is_virtual,
        balance: acc.balance,
        currency: acc.currency
      };
      setAuthState(nextAuth);
      localStorage.setItem('deriv_auth', JSON.stringify(nextAuth));
      if (sessionProtocol.isSaveSettingsEnabled) {
        writeSavedSettingsSnapshot({ auth: nextAuth });
      }
      window.location.reload();
    }
  }, [authState, sessionProtocol.isSaveSettingsEnabled, writeSavedSettingsSnapshot]);

  const removeSavedToken = useCallback((token: string) => {
    setSavedTokens(prev => {
      const filtered = prev.filter(t => t.token !== token);
      localStorage.setItem('deriv_saved_tokens', JSON.stringify(filtered));
      return filtered;
    });
  }, []);

  useEffect(() => {
    settingsRef.current = executionSettings;
  }, [executionSettings]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  useEffect(() => {
    balanceRef.current = authState.balance || 0;
  }, [authState.balance]);

  const handleSelfSettlement = useCallback((tick: Tick) => {
    const pendingTrades = pendingTradesRef.current;
    if (pendingTrades.length === 0) return;

    let totalBatchProfit = 0;
    let anyWon = false;
    let newBalance = balanceRef.current || 0;
    const activeSym = selectedSymbolRef.current;

    const results = pendingTrades.map(trade => {
      const result = settleSimulatedTrade(trade, tick.quote, newBalance, activeSym);
      if (result.won) anyWon = true;
      
      if (!trade.is_virtual_trade) {
        totalBatchProfit += result.profit;
        newBalance = result.newBalance;
      }
      return { 
        id: trade.id, 
        status: result.won ? 'won' as const : 'lost' as const, 
        profit: result.profit, 
        exit_tick: tick.quote 
      };
    });

    setHistory(prev => prev.map(t => {
      const update = results.find(r => r.id === t.id);
      return update ? { ...t, ...update } : t;
    }));

    // Protocol State Machine
    const lastTrade = pendingTrades[0];
    if (lastTrade) {
      const won = anyWon;
      const maxM = parseInt(settingsRef.current.maxMartingale || '10', 10);
      
      if (settingsRef.current.isLossHookEnabled) {
        // VIRTUAL HOOK LOGIC
        if (lastTrade.is_virtual_trade) {
          if (!won) {
            setConsecutiveVirtualLosses(prev => {
              const next = prev + 1;
              const threshold = parseInt(settingsRef.current.lossHook || '1', 10);
              if (next >= threshold) setIsHuntingInReal(true);
              return next;
            });
          } else {
            setConsecutiveVirtualLosses(0); // Win in virtual resets streak
          }
        } else {
          // REAL PHASE LOGIC
          if (won) {
            setCurrentMartingaleLevel(0);
            setIsHuntingInReal(false); // Return to virtual hunt
            setConsecutiveVirtualLosses(0);
          } else {
            setCurrentMartingaleLevel(prev => {
              const next = prev + 1;
              return maxM > 0 && next > maxM ? 0 : next;
            });
          }
        }
      } else {
        // STANDARD TRADING LOGIC
        if (won) setCurrentMartingaleLevel(0);
        else {
          setCurrentMartingaleLevel(prev => {
            const next = prev + 1;
            return maxM > 0 && next > maxM ? 0 : next;
          });
        }
      }
    }

    const hasRealTrade = pendingTrades.some(t => !t.is_virtual_trade);
    if (hasRealTrade) {
      const sessionProfitBefore = historyRef.current
        .filter(t => !t.is_virtual_trade && t.status !== 'nil' && t.status !== 'open')
        .reduce((acc, t) => acc + (t.profit || 0), 0);
      const sessionNet = sessionProfitBefore + totalBatchProfit;

      const tp = parseFloat(settingsRef.current.takeProfit || '0');
      const sl = parseFloat(settingsRef.current.stopLoss || '0');

      if (tp > 0 && sessionNet >= tp) {
        setIsMonitoring(false);
        setIsMonitoringDex(false);
        setTerminalMessage({
          type: 'tp',
          title: 'Take Profit Target Reached',
          description: `Neural target of $${tp.toFixed(2)} reached. Protocol placed in safe idle mode.`
        });
      } else if (sl > 0 && sessionNet <= -sl) {
        setIsMonitoring(false);
        setIsMonitoringDex(false);
        setTerminalMessage({
          type: 'sl',
          title: 'Stop Loss Threshold Hit',
          description: `Safety threshold of -$${sl.toFixed(2)} reached. Protocol terminated.`
        });
      }
      setAuthState(prev => ({ ...prev, balance: newBalance }));
    }

    pendingTradesRef.current = [];
    setIsAutoTrading(false);
  }, []);

  const handleSelfSettlementRef = useRef(handleSelfSettlement);
  useEffect(() => {
    handleSelfSettlementRef.current = handleSelfSettlement;
  }, [handleSelfSettlement]);

  const processHistoricalData = useCallback((prices: number[]) => {
    if (prices.length === 0) return;
    setIsAnalyzingDex(true);
    const mode = strategyParams.dexAnalysisMode || 'even_odd';
    const barrier = parseInt(strategyParams.dexBarrier || '4');
    const minLen = parseInt(strategyParams.dexPatternMinLen || '2');
    const maxLen = Math.min(parseInt(strategyParams.dexPatternMaxLen || '4'), 8);
    
    const digits = prices.map(p => getDigit(p, selectedSymbol));
    const symbols = digits.map(d => {
      if (mode === 'even_odd') return d % 2 === 0 ? 'E' : 'O';
      return d > barrier ? 'H' : 'L';
    });

    const patternsMap: Record<string, { pos: number; neg: number; total: number }> = {};

    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i < symbols.length - len - 3; i++) {
        const seq = symbols.slice(i, i + len).join('');
        if (!patternsMap[seq]) patternsMap[seq] = { pos: 0, neg: 0, total: 0 };
        
        for (let next = 1; next <= 3; next++) {
          const outcome = symbols[i + len + next - 1];
          if (mode === 'even_odd') {
            if (outcome === 'E') patternsMap[seq].pos++;
            else patternsMap[seq].neg++;
          } else {
            if (outcome === 'H') patternsMap[seq].pos++;
            else patternsMap[seq].neg++;
          }
          patternsMap[seq].total++;
        }
      }
    }

    const discovered: DiscoveredPattern[] = Object.entries(patternsMap)
      .filter(([_, stats]) => stats.total >= 6)
      .map(([seq, stats]) => {
        const posProb = (stats.pos / stats.total) * 100;
        const negProb = (stats.neg / stats.total) * 100;
        
        const bestOutcome = mode === 'even_odd' 
          ? (posProb >= negProb ? 'EVEN' : 'ODD')
          : (posProb >= negProb ? `OVER ${barrier}` : `UNDER ${barrier + 1}`);
          
        return {
          sequence: seq,
          occurrences: stats.total / 3,
          evenProb: mode === 'even_odd' ? posProb : 0,
          oddProb: mode === 'even_odd' ? negProb : 0,
          overProb: mode === 'over_under' ? posProb : 0,
          underProb: mode === 'over_under' ? negProb : 0,
          bestOutcome,
          confidence: Math.max(posProb, negProb)
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 50);

    setHistoricalAnalysis({
      totalSamples: prices.length,
      discoveredPatterns: discovered,
      lastDiscoveryEpoch: Date.now()
    });
    setIsAnalyzingDex(false);
  }, [strategyParams.dexAnalysisMode, strategyParams.dexBarrier, strategyParams.dexPatternMinLen, strategyParams.dexPatternMaxLen, selectedSymbol]);

  const connect = useCallback(async (accountId: string) => {
    if (ws.current) {
      ws.current.onclose = null;
      ws.current.close();
      ws.current = null;
    }
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

    setIsAuthorizing(true);

    try {
      const sessionToken = getSessionToken();
      const otpRes = await fetch('/api/deriv/ws-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        body: JSON.stringify({ account_id: accountId })
      });
      const otpData = await otpRes.json();

      if (otpRes.status === 401) {
        patRef.current = null;
        sessionStorage.removeItem('deriv_pat_session');
        localStorage.removeItem('deriv_auth');
        setAuthState({ isLoggedIn: false, isAdmin: false, accounts: [], activeAccountIndex: 0 });
        setIsConnected(false);
        setIsAuthorizing(false);
        toast({ variant: "destructive", title: "Session Expired", description: "Please authorize your Deriv token again." });
        return;
      }
      
      if (!otpData.ws_url) throw new Error(otpData.error || 'WS URL Request Failed');

      const socket = new WebSocket(otpData.ws_url);
      ws.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ping: 1 }));
        }, 10000);

        const sym = selectedSymbolRef.current;
        socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        socket.send(JSON.stringify({ active_symbols: 'brief' }));
        socket.send(JSON.stringify({ ticks_history: sym, adjust_start_time: 1, count: 1000, end: 'latest', style: 'ticks' }));
        socket.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
      };

      socket.onmessage = (msg) => {
        let data: any;
        try {
          data = JSON.parse(msg.data);
        } catch (parseErr) {
          console.error('Deriv WebSocket message parse error:', parseErr);
          return;
        }

        if (data.error) {
          console.error('Deriv WebSocket API error:', data.error);
          toast({ variant: "destructive", title: "Stream Error", description: data.error.message || 'Deriv stream fault' });
          setIsAuthorizing(false);
          return;
        }
        
        if (data.msg_type === 'tick') {
          if (data.tick.symbol === selectedSymbolRef.current) {
            const newTick = { quote: data.tick.quote, epoch: data.tick.epoch, id: `tick-${data.tick.epoch}` };
            setCurrentTicks(prev => {
              if (prev.length > 0 && prev[0].epoch === newTick.epoch) return prev;
              return [newTick, ...prev].slice(0, 10000);
            });
            if (pendingTradesRef.current.length > 0) {
              handleSelfSettlementRef.current(newTick);
            }
          }
        }
        
        if (data.msg_type === 'active_symbols') {
          if (data.active_symbols && Array.isArray(data.active_symbols)) {
            const filtered = data.active_symbols.filter((s: any) => s && s.symbol && typeof s.symbol === 'string' && s.symbol.startsWith('R_'));
            setMarkets(filtered.length > 0 ? filtered : FALLBACK_MARKETS);
          }
        }

        if (data.msg_type === 'history') {
          const prices = data.history.prices as number[];
          const times = data.history.times as number[];
          if (prices && prices.length > 0) {
            const historicalTicks: Tick[] = prices.map((p, i) => ({
              quote: p,
              epoch: times ? times[i] : 0,
              id: `hist-${times ? times[i] : i}`
            })).reverse();
            setCurrentTicks(historicalTicks);
            processHistoricalData(prices);
          }
        }

        if (data.msg_type === 'balance') {
          setAuthState(prev => ({ ...prev, balance: data.balance.balance, currency: data.balance.currency }));
          setIsAuthorizing(false);
        }
      };

      socket.onerror = (event) => {
        console.error('Deriv WebSocket error:', event);
        toast({ variant: "destructive", title: "Stream Connection Error", description: "WebSocket connection failed." });
        setIsConnected(false);
        setIsAuthorizing(false);
      };

      socket.onclose = () => setIsConnected(false);
    } catch (err: any) {
      console.error('Deriv WebSocket connect error:', err);
      toast({ variant: "destructive", title: "Auth Protocol Fault", description: err.message });
      setIsAuthorizing(false);
    }
  }, [getSessionToken]);

  useEffect(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    setCurrentTicks([]);
    ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
    ws.current.send(JSON.stringify({ ticks_history: selectedSymbol, adjust_start_time: 1, count: 1000, end: 'latest', style: 'ticks' }));
    ws.current.send(JSON.stringify({ ticks: selectedSymbol, subscribe: 1 }));
  }, [selectedSymbol]);

  const fetchHistoricalData = (count: number) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({
      ticks_history: selectedSymbol,
      adjust_start_time: 1,
      count: Math.min(count, 10000),
      end: 'latest',
      style: 'ticks'
    }));
  };

  useEffect(() => {
    if (!isMonitoringDex || activeRobotId !== 'calculation_dex') return;
    const priceBuffer = currentTicks.slice(0, parseInt(strategyParams.dexTickCount || '1000')).map(t => t.quote).reverse();
    if (priceBuffer.length > 0) {
      processHistoricalData(priceBuffer);
    }
  }, [currentTicks.length > 0 ? currentTicks[0].epoch : null, isMonitoringDex, activeRobotId, strategyParams.dexTickCount, strategyParams.dexAnalysisMode, strategyParams.dexBarrier, strategyParams.dexPatternMinLen, strategyParams.dexPatternMaxLen, processHistoricalData]);

  const placeTrade = useCallback(async (params: { type: string; barrier?: number }) => {
    const baseStake = parseFloat(executionSettings.stake);
    if (!Number.isFinite(baseStake) || baseStake <= 0) return null;
    let stake = baseStake;

    // Use Virtual Execution Logic for Calculation Dex if Hook enabled
    const useVirtual = settingsRef.current.isLossHookEnabled && !isHuntingInReal;

    if (!useVirtual && currentMartingaleLevel > 0) {
      if (executionSettings.isAutoMartingaleEnabled) {
        const currentStreak = historyRef.current.slice(0, currentMartingaleLevel);
        const totalRealLoss = currentStreak.reduce((acc, t) => acc + (t.is_virtual_trade ? 0 : Math.abs(t.stake)), 0);
        stake = totalRealLoss / 0.86;
      } else {
        stake = baseStake * Math.pow(parseFloat(executionSettings.martingale), currentMartingaleLevel);
      }
    }

    if (useVirtual) {
      const virtualItem: TradeHistoryItem = {
        id: `virtual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        symbol: selectedSymbol,
        type: params.type,
        contract_type: `DIGIT${params.type.toUpperCase()}`,
        stake: baseStake,
        status: 'open',
        timestamp: Date.now(),
        entry_epoch: Date.now() / 1000,
        entry_tick: currentTicks[0]?.quote || 0,
        barrier: params.barrier,
        martingale_level: 0,
        is_virtual_trade: true
      };
      setHistory(prev => [virtualItem, ...prev]);
      return virtualItem;
    }

    const account = authState.accounts[authState.activeAccountIndex];
    if (!account) return null;

    try {
      const sessionToken = getSessionToken();
      const res = await fetch('/api/deriv/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        body: JSON.stringify({
          account_id: account.account_id,
          is_virtual: account.is_virtual,
          contract_type: `DIGIT${params.type.toUpperCase()}`,
          symbol: selectedSymbol,
          stake: stake.toFixed(2),
          barrier: params.barrier,
          currency: authState.currency || account.currency || 'USD'
        })
      });

      const result = await res.json();
      if (result.ok) {
        const newItem: TradeHistoryItem = {
          id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          symbol: selectedSymbol,
          type: params.type,
          contract_type: `DIGIT${params.type.toUpperCase()}`,
          stake,
          status: 'open',
          timestamp: Date.now(),
          entry_epoch: Date.now() / 1000,
          entry_tick: currentTicks[0]?.quote || 0,
          barrier: params.barrier,
          martingale_level: currentMartingaleLevel,
          contract_id: result.data.contract_id
        };
        setHistory(prev => [newItem, ...prev]);
        return newItem;
      } else {
        throw new Error(result.error || 'Execution Denied');
      }
    } catch (err: any) {
      console.error('Deriv placeTrade error:', err);
      toast({ variant: "destructive", title: "Execution Fault", description: err.message });
      return null;
    }
  }, [executionSettings.stake, executionSettings.martingale, executionSettings.isAutoMartingaleEnabled, currentMartingaleLevel, authState.accounts, authState.activeAccountIndex, authState.currency, selectedSymbol, currentTicks, isHuntingInReal, getSessionToken]);

  useEffect(() => {
    if (!isMonitoringDex || !historicalAnalysis || historicalAnalysis.discoveredPatterns.length === 0 || isAutoTrading) return;
    const bestPattern = historicalAnalysis.discoveredPatterns[0];
    const len = bestPattern.sequence.length;
    if (currentTicks.length < len) return;

    const samples = currentTicks.slice(0, len).reverse();
    const mode = strategyParams.dexAnalysisMode;
    const barrier = parseInt(strategyParams.dexBarrier);
    
    const currentSeq = samples.map(t => {
      const d = getDigit(t.quote, selectedSymbol);
      if (mode === 'even_odd') return d % 2 === 0 ? 'E' : 'O';
      return d > barrier ? 'H' : 'L';
    }).join('');

    if (currentSeq === bestPattern.sequence) {
      const outcome = bestPattern.bestOutcome;
      let type = 'even';
      let tradeBarrier: number | undefined;

      if (outcome === 'EVEN') type = 'even';
      else if (outcome === 'ODD') type = 'odd';
      else if (outcome.includes('OVER')) {
        type = 'over';
        tradeBarrier = parseInt(outcome.split(' ')[1]);
      } else if (outcome.includes('UNDER')) {
        type = 'under';
        tradeBarrier = parseInt(outcome.split(' ')[1]);
      }

      setIsAutoTrading(true);
      placeTrade({ type, barrier: tradeBarrier }).then(t => {
        if (t) pendingTradesRef.current = [t];
        else setIsAutoTrading(false);
      }).catch(err => {
        console.error('Calculation Dex auto-trade error:', err);
        setIsAutoTrading(false);
      });
    }
  }, [currentTicks, isMonitoringDex, historicalAnalysis, isAutoTrading, strategyParams.dexAnalysisMode, strategyParams.dexBarrier, selectedSymbol, placeTrade]);

  const login = async (pat: string, mode: 'pat' | 'api', remember: boolean = false) => {
    setIsAuthorizing(true);
    try {
      const res = await fetch('/api/deriv/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pat })
      });
      const data = await res.json();
      if (data.ok && data.accounts.length > 0) {
        patRef.current = pat;
        sessionStorage.setItem('deriv_pat_session', pat);

        let targetIndex = 0;
        if (sessionProtocol.isSaveSettingsEnabled) {
          try {
            const rawPrefs = localStorage.getItem(SAVED_PREFERENCES_KEY);
            if (rawPrefs) {
              const prefs = JSON.parse(rawPrefs);
              if (prefs.activeAccountId) {
                const matchedIdx = data.accounts.findIndex((a: any) => a.account_id === prefs.activeAccountId);
                if (matchedIdx >= 0) targetIndex = matchedIdx;
              } else if (typeof prefs.isVirtual === 'boolean') {
                const matchedIdx = data.accounts.findIndex((a: any) => Boolean(a.is_virtual) === prefs.isVirtual);
                if (matchedIdx >= 0) targetIndex = matchedIdx;
              }
            }
          } catch (prefErr) {
            console.error('Failed to read saved account preference on login:', prefErr);
          }
        }

        const primaryAccount = data.accounts[targetIndex] || data.accounts[0];
        const resolvedIndex = data.accounts.indexOf(primaryAccount);
        const newAuthState = {
          ...authState,
          isLoggedIn: true,
          accounts: data.accounts,
          activeAccountIndex: resolvedIndex >= 0 ? resolvedIndex : 0,
          isVirtual: primaryAccount.is_virtual,
          balance: primaryAccount.balance,
          currency: primaryAccount.currency,
          email: primaryAccount.email,
          mode
        };
        setAuthState(newAuthState);
        localStorage.setItem('deriv_auth', JSON.stringify(newAuthState));

        if (remember) {
          const existing = savedTokens.find(t => t.token === pat);
          if (!existing) {
            setSavedTokens(prev => {
              const next = [...prev, { label: data.accounts[0].email || pat.slice(0, 8), token: pat, mode }];
              localStorage.setItem('deriv_saved_tokens', JSON.stringify(next));
              return next;
            });
          }
        }

        connect(primaryAccount.account_id);
      } else {
        throw new Error(data.error || 'Identity Sync Failed');
      }
    } catch (err: any) {
      console.error('Deriv login error:', err);
      toast({ variant: "destructive", title: "Login Fault", description: err.message });
      setIsAuthorizing(false);
    }
  };

  const logout = useCallback(() => {
    patRef.current = null;
    sessionStorage.removeItem('deriv_pat_session');
    fetch('/api/deriv/login', { method: 'DELETE' }).catch((err) => {
      console.error('Deriv logout request failed:', err);
    }).finally(() => {
      localStorage.clear();
      window.location.reload();
    });
  }, []);

  const magicSignal = useMemo(() => {
    if (currentTicks.length < 2) return null;
    const currentPrice = currentTicks[0].quote;
    const sampleSize = parseInt(executionSettings.tickSample || '100');
    const samples = currentTicks.slice(0, sampleSize);
    if (samples.length < 2) return null;

    let totalDiff = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      totalDiff += Math.abs(samples[i].quote - samples[i+1].quote);
    }
    const avgDiff = totalDiff / (samples.length - 1);
    const precision = getMarketPrecision(selectedSymbol);

    const plusDigit = parseInt((currentPrice + avgDiff).toFixed(precision).slice(-1));
    const minusDigit = parseInt((currentPrice - avgDiff).toFixed(precision).slice(-1));
    
    const overB = parseInt(strategyParams.overBarrier);
    const underB = parseInt(strategyParams.underBarrier);

    if (strategyType === 'even_odd') {
      if (plusDigit % 2 === 0 && minusDigit % 2 === 0) return { type: 'even', text: 'TRADE EVEN' };
      if (plusDigit % 2 !== 0 && minusDigit % 2 !== 0) return { type: 'odd', text: 'TRADE ODD' };
    } else if (strategyType === 'over_under') {
      if (plusDigit > overB && minusDigit > overB) return { type: 'over', text: `TRADE OVER ${overB}` };
      if (plusDigit < underB && minusDigit < underB) return { type: 'under', text: `TRADE UNDER ${underB}` };
    }
    return null;
  }, [currentTicks, strategyType, strategyParams.overBarrier, strategyParams.underBarrier, executionSettings.tickSample, selectedSymbol]);

  const matchedDigits = useMemo(() => {
    const samplesCount = Math.max(1, parseInt(executionSettings.tickSample || '30', 10) || 30);
    if (currentTicks.length < samplesCount) return [];
    const stream = currentTicks.slice(0, samplesCount);
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    stream.forEach((tick) => {
      const d = getDigit(tick.quote, selectedSymbol);
      if (!Number.isNaN(d) && d >= 0 && d <= 9) counts[d]++;
    });
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => counts[d] === 0);
  }, [currentTicks, selectedSymbol, executionSettings.tickSample]);

  const aiGaps = useMemo(() => {
    const samplesCount = Math.max(1, parseInt(executionSettings.tickSample || '20', 10) || 20);
    if (currentTicks.length < samplesCount) return { over: [] as number[], under: [] as number[] };
    const stream = currentTicks.slice(0, samplesCount);
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    stream.forEach((tick) => {
      const d = getDigit(tick.quote, selectedSymbol);
      if (!Number.isNaN(d) && d >= 0 && d <= 9) counts[d]++;
    });

    if (strategyParams.aiScannerMode === 'even_odd') {
      return {
        over: [0, 2, 4, 6, 8].filter((d) => counts[d] === 0),
        under: [1, 3, 5, 7, 9].filter((d) => counts[d] === 0),
      };
    }

    const overB = parseInt(strategyParams.overBarrier || '4', 10);
    const underB = parseInt(strategyParams.underBarrier || '5', 10);
    return {
      over: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d > overB && counts[d] === 0),
      under: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d < underB && counts[d] === 0),
    };
  }, [currentTicks, selectedSymbol, executionSettings.tickSample, strategyParams.aiScannerMode, strategyParams.overBarrier, strategyParams.underBarrier]);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        const savedAuth = localStorage.getItem('deriv_auth');
        const savedProtocol = localStorage.getItem('deriv_protocol');
        const tokens = localStorage.getItem('deriv_saved_tokens');

        if (tokens) setSavedTokens(JSON.parse(tokens));
        if (savedProtocol) setSessionProtocol(JSON.parse(savedProtocol));

        const proto = savedProtocol ? JSON.parse(savedProtocol) : DEFAULT_SESSION_PROTOCOL;
        let savedPrefs: any = null;
        if (proto.isSaveSettingsEnabled) {
          const savedStrategy = localStorage.getItem('deriv_strategy');
          const savedExec = localStorage.getItem('deriv_execution');
          const rawPrefs = localStorage.getItem(SAVED_PREFERENCES_KEY);

          if (rawPrefs) {
            savedPrefs = JSON.parse(rawPrefs);
            if (savedPrefs.selectedSymbol) {
              setSelectedSymbol(savedPrefs.selectedSymbol);
              selectedSymbolRef.current = savedPrefs.selectedSymbol;
            }
            if (savedPrefs.activeRobotId) setActiveRobotId(savedPrefs.activeRobotId);
            if (savedPrefs.strategyType) setStrategyType(savedPrefs.strategyType);
            if (typeof savedPrefs.isBotEnabled === 'boolean') setIsBotEnabled(savedPrefs.isBotEnabled);
            if (typeof savedPrefs.isHunterEnabled === 'boolean') setIsHunterEnabled(savedPrefs.isHunterEnabled);
            if (savedPrefs.strategyParams) setStrategyParams(savedPrefs.strategyParams);
            if (savedPrefs.executionSettings) setExecutionSettings(savedPrefs.executionSettings);
          }

          if (savedStrategy && !savedPrefs?.strategyParams) setStrategyParams(JSON.parse(savedStrategy));
          if (savedExec && !savedPrefs?.executionSettings) setExecutionSettings(JSON.parse(savedExec));
        }

        if (savedAuth) {
          const parsedAuth = JSON.parse(savedAuth);
          if (parsedAuth.isLoggedIn && parsedAuth.accounts?.length > 0) {
            if (proto.isSaveSettingsEnabled && savedPrefs) {
              let resolvedIdx = -1;
              if (savedPrefs.activeAccountId) {
                resolvedIdx = parsedAuth.accounts.findIndex((a: any) => a.account_id === savedPrefs.activeAccountId);
              }
              if (resolvedIdx < 0 && typeof savedPrefs.activeAccountIndex === 'number' && parsedAuth.accounts[savedPrefs.activeAccountIndex]) {
                resolvedIdx = savedPrefs.activeAccountIndex;
              }
              if (resolvedIdx >= 0) {
                const chosenAcc = parsedAuth.accounts[resolvedIdx];
                parsedAuth.activeAccountIndex = resolvedIdx;
                parsedAuth.isVirtual = chosenAcc.is_virtual;
                parsedAuth.balance = chosenAcc.balance;
                parsedAuth.currency = chosenAcc.currency;
              }
            }

            const sessionRes = await fetch('/api/deriv/login');
            const sessionData = await sessionRes.json();
            if (!isMounted) return;

            const hasToken = sessionData.authenticated || Boolean(getSessionToken());
            if (hasToken) {
              setAuthState(parsedAuth);
              const activeAcc = parsedAuth.accounts[parsedAuth.activeAccountIndex] || parsedAuth.accounts[0];
              if (activeAcc) connect(activeAcc.account_id);
            } else {
              localStorage.removeItem('deriv_auth');
              setAuthState({ isLoggedIn: false, isAdmin: false, accounts: [], activeAccountIndex: 0 });
            }
          } else {
            setAuthState(parsedAuth);
          }
        }
      } catch (err) {
        console.error('Failed to restore persisted Deriv state from localStorage:', err);
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };

    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isInitializing) {
      localStorage.setItem('deriv_auth', JSON.stringify(authState));
      localStorage.setItem('deriv_protocol', JSON.stringify(sessionProtocol));

      if (sessionProtocol.isSaveSettingsEnabled) {
        writeSavedSettingsSnapshot();
      }
    }
  }, [
    authState,
    selectedSymbol,
    activeRobotId,
    strategyType,
    strategyParams,
    executionSettings,
    isBotEnabled,
    isHunterEnabled,
    sessionProtocol,
    isInitializing,
    writeSavedSettingsSnapshot,
  ]);

  const setSaveSettingsEnabled = useCallback((enabled: boolean) => {
    const nextProtocol: SessionProtocolSettings = {
      ...sessionProtocol,
      isSaveSettingsEnabled: enabled,
    };
    setSessionProtocol(nextProtocol);
    if (typeof window !== 'undefined') {
      localStorage.setItem('deriv_protocol', JSON.stringify(nextProtocol));
      localStorage.setItem('deriv_auth', JSON.stringify(authState));
    }

    if (enabled) {
      writeSavedSettingsSnapshot();
      toast({
        title: 'Save Settings Enabled',
        description: 'Trading settings, selected market, and account type will persist across page refreshes.',
      });
    } else {
      clearSavedSettingsSnapshot();
      toast({
        title: 'Save Settings Disabled',
        description: 'Saved configuration lock cleared. Future refreshes will use default trading settings.',
      });
    }
  }, [sessionProtocol, authState, writeSavedSettingsSnapshot, clearSavedSettingsSnapshot]);

  useEffect(() => {
    if (!isMonitoring) {
      lastDigitMatchEpochRef.current = null;
      lastAiTradeEpochRef.current = null;
    }
  }, [isMonitoring]);

  useEffect(() => {
    if (!isMonitoring || activeRobotId !== 'digit_match' || isAutoTrading || pendingTradesRef.current.length > 0) return;
    if (currentTicks.length === 0) return;

    const latestTick = currentTicks[0];
    const tickKey = latestTick.id || latestTick.epoch;
    if (lastDigitMatchEpochRef.current === tickKey) return;

    let targets: number[] = [];

    if (strategyParams.matchStrategy === 'scanner') {
      const samplesCount = Math.max(1, parseInt(executionSettings.tickSample || '30', 10) || 30);
      const analyzeCount = Math.max(1, Math.min(5, parseInt(executionSettings.digitsToAnalyze || '1', 10) || 1));
      if (currentTicks.length < samplesCount || matchedDigits.length < analyzeCount) return;
      targets = matchedDigits.slice(0, analyzeCount);
    } else if (strategyParams.matchStrategy === 'input') {
      const digitsToTrade = (strategyParams.matchDigitsToTrade || '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 9);
      const entryDigits = (strategyParams.matchEntryDigits || '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 9);
      const entryCount = Math.max(1, parseInt(strategyParams.matchEntryCount || '1', 10) || 1);

      if (digitsToTrade.length === 0 || entryDigits.length === 0 || currentTicks.length < entryCount) return;
      const recentDigits = currentTicks.slice(0, entryCount).map((t) => getDigit(t.quote, selectedSymbol));
      const entryMet = recentDigits.every((d) => entryDigits.includes(d));
      if (!entryMet) return;
      targets = digitsToTrade;
    } else if (strategyParams.matchStrategy === 'exit_digit') {
      const exitDigit = getDigit(latestTick.quote, selectedSymbol);
      if (Number.isNaN(exitDigit)) return;
      targets = [exitDigit];
    }

    if (targets.length === 0) return;

    lastDigitMatchEpochRef.current = tickKey;
    setIsAutoTrading(true);

    Promise.all(targets.map((digit) => placeTrade({ type: 'match', barrier: digit })))
      .then((trades) => {
        const validTrades = trades.filter((t): t is TradeHistoryItem => Boolean(t));
        if (validTrades.length > 0) {
          pendingTradesRef.current = validTrades;
        } else {
          setIsAutoTrading(false);
        }
      })
      .catch((err) => {
        console.error('Digit Match auto-trade error:', err);
        setIsAutoTrading(false);
      });
  }, [
    isMonitoring,
    activeRobotId,
    isAutoTrading,
    currentTicks,
    matchedDigits,
    selectedSymbol,
    strategyParams.matchStrategy,
    strategyParams.matchDigitsToTrade,
    strategyParams.matchEntryDigits,
    strategyParams.matchEntryCount,
    executionSettings.tickSample,
    executionSettings.digitsToAnalyze,
    placeTrade,
  ]);

  useEffect(() => {
    if (!isMonitoring || activeRobotId !== 'ai_trade' || isAutoTrading || pendingTradesRef.current.length > 0) return;
    if (currentTicks.length === 0) return;

    const latestTick = currentTicks[0];
    const tickKey = latestTick.id || latestTick.epoch;
    if (lastAiTradeEpochRef.current === tickKey) return;

    const targetMissing = Math.max(1, parseInt(strategyParams.aiMissingDigitsCount || '3', 10) || 3);
    const overMissing = aiGaps.over.length;
    const underMissing = aiGaps.under.length;
    if (overMissing < targetMissing && underMissing < targetMissing) return;

    const tradeStrongerOver = overMissing >= underMissing;
    let tradeParams: { type: string; barrier?: number };
    if (strategyParams.aiScannerMode === 'even_odd') {
      tradeParams = { type: tradeStrongerOver ? 'even' : 'odd' };
    } else {
      tradeParams = tradeStrongerOver
        ? { type: 'over', barrier: parseInt(strategyParams.overBarrier || '4', 10) }
        : { type: 'under', barrier: parseInt(strategyParams.underBarrier || '5', 10) };
    }

    lastAiTradeEpochRef.current = tickKey;
    setIsAutoTrading(true);
    placeTrade(tradeParams)
      .then((trade) => {
        if (trade) pendingTradesRef.current = [trade];
        else setIsAutoTrading(false);
      })
      .catch((err) => {
        console.error('AI Trade scanner auto-trade error:', err);
        setIsAutoTrading(false);
      });
  }, [
    isMonitoring,
    activeRobotId,
    isAutoTrading,
    currentTicks,
    aiGaps,
    strategyParams.aiMissingDigitsCount,
    strategyParams.aiScannerMode,
    strategyParams.overBarrier,
    strategyParams.underBarrier,
    placeTrade,
  ]);

  useEffect(() => {
    if (isMonitoring && activeRobotId === 'magic_box' && magicSignal && !isAutoTrading && pendingTradesRef.current.length === 0) {
      const barrier = magicSignal.type === 'over' ? parseInt(strategyParams.overBarrier) : 
                      magicSignal.type === 'under' ? parseInt(strategyParams.underBarrier) : undefined;
      setIsAutoTrading(true);
      placeTrade({ type: magicSignal.type, barrier }).then(trade => {
        if (trade) pendingTradesRef.current = [trade];
        else setIsAutoTrading(false);
      }).catch(err => {
        console.error('Magic Box auto-trade error:', err);
        setIsAutoTrading(false);
      });
    }
  }, [magicSignal, isMonitoring, activeRobotId, isAutoTrading, strategyParams.overBarrier, strategyParams.underBarrier, placeTrade]);

  return (
    <DerivContext.Provider value={{ 
      authState, markets, currentTicks, history, selectedSymbol, setSelectedSymbol, 
      strategyType, setStrategyType, strategyParams, 
      setStrategyParams: (p) => setStrategyParams(v => ({...v, ...p})), 
      executionSettings, setExecutionSettings: (s) => setExecutionSettings(v => ({...v, ...s})), 
      sessionProtocol, setSessionProtocol: (p) => setSessionProtocol(v => ({...v, ...p})), 
      setSaveSettingsEnabled,
      login, 
      adminLogin: (email, pass) => email === 'admin' && pass === 'password', 
      logout, 
      placeTrade: async (p) => {
        setIsAutoTrading(true);
        const t = await placeTrade(p);
        if (t) pendingTradesRef.current = [t];
        else setIsAutoTrading(false);
      }, 
      clearHistory: () => setHistory([]), 
      isAutoTrading, isBotEnabled, setIsBotEnabled, isHunterEnabled, setIsHunterEnabled, 
      isMonitoring, setIsMonitoring, 
      stopBotSession: () => setIsAutoTrading(false), switchAccount, 
      isInitializing, isAuthorizing, overrides: [], updateOverride: () => {}, 
      deleteOverride: () => {}, 
      dynamicPayout: null, dynamicOverPayout: null, dynamicUnderPayout: null, 
      dynamicOverPayouts: {}, dynamicUnderPayouts: {}, fetchProposal: () => {}, 
      terminalMessage, setTerminalMessage, acknowledgeTerminalMessage: () => setTerminalMessage(null), 
      sessionStartingBalance: null, sessionStartTime: null, currentMartingaleLevel, 
      isWaitingForSignal: !magicSignal, activeRobotId, 
      setActiveRobotId, 
      matchedDigits, protocolStatus: {
        message: executionSettings.isLossHookEnabled 
          ? (isHuntingInReal ? `REAL NODE ACTIVE (RECOVERY LVL ${currentMartingaleLevel})` : `VIRTUAL NODE: ${consecutiveVirtualLosses}/${executionSettings.lossHook} LOSSES`)
          : (currentMartingaleLevel > 0 ? `RECOVERY LEVEL ${currentMartingaleLevel}` : 'BASE STRIKE ACTIVE'),
      }, 
      isConnected, isReconnecting: false, networkGlitch: false, aiGaps, refreshCountdown: null,
      isAnalyzingDex, historicalAnalysis,
      isMonitoringDex,
      setIsMonitoringDex: (val) => {
        if (val) {
          setConsecutiveVirtualLosses(0);
          setIsHuntingInReal(false);
        }
        setIsMonitoringDex(val);
      },
      highestPeakValue: 0,
      resetDexPeak: () => setHistoricalAnalysis(null),
      fetchHistoricalData,
      addUpStep: 0,
      magicSignal,
      savedTokens,
      removeSavedToken
    }}>
      {children}
    </DerivContext.Provider>
  );
}

export const useDeriv = () => { const context = useContext(DerivContext); if (!context) throw new Error('useDeriv error'); return context; };
