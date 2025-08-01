import { 
  RSI, 
  MACD, 
  BollingerBands, 
  SMA, 
  EMA, 
  Stochastic,
  WilliamsR,
  CCI,
  ROC,
  OBV,
  VWAP,
  ATR,
  ADX
} from 'technicalindicators';
import * as ss from 'simple-statistics';

export class TraditionalTAAnalyzer {
  constructor() {
    this.indicatorPeriods = {
      rsi: 14,
      macd: { fast: 12, slow: 26, signal: 9 },
      bollinger: { period: 20, stdDev: 2 },
      sma: [5, 10, 20, 50, 200],
      ema: [5, 10, 20, 50, 200],
      stochastic: { kPeriod: 14, dPeriod: 3 },
      williams: 14,
      cci: 20,
      roc: 10,
      atr: 14,
      adx: 14
    };
  }

  /**
   * Comprehensive technical analysis of OHLCV data
   * @param {Array} ohlcvData - Array of {open, high, low, close, volume, timestamp}
   * @returns {Object} Complete technical analysis
   */
  async analyzeTechnicals(ohlcvData) {
    try {
      console.log(`📊 Starting traditional TA analysis on ${ohlcvData.length} data points...`);
      
      if (!ohlcvData || ohlcvData.length < 50) {
        throw new Error('Insufficient data for technical analysis (minimum 50 data points required)');
      }

      // Extract arrays for indicators
      const closes = ohlcvData.map(d => d.close);
      const opens = ohlcvData.map(d => d.open);
      const highs = ohlcvData.map(d => d.high);
      const lows = ohlcvData.map(d => d.low);
      const volumes = ohlcvData.map(d => d.volume);

      // Calculate all technical indicators
      const indicators = await this.calculateAllIndicators({
        open: opens,
        high: highs,
        low: lows,
        close: closes,
        volume: volumes
      });

      // Generate trading signals from indicators
      const signals = this.generateTradingSignals(indicators, ohlcvData);

      // Calculate overall technical score
      const technicalScore = this.calculateTechnicalScore(indicators, signals);

      // Generate price targets and risk assessment
      const priceTargets = this.calculatePriceTargets(indicators, closes[closes.length - 1]);
      const riskAssessment = this.calculateRiskAssessment(indicators, ohlcvData);

      const analysis = {
        indicators: indicators,
        signals: signals,
        technicalScore: technicalScore,
        priceTargets: priceTargets,
        riskAssessment: riskAssessment,
        overallSignal: this.determineOverallSignal(signals, technicalScore),
        confidence: this.calculateConfidence(indicators, signals),
        recommendation: this.generateRecommendation(signals, technicalScore),
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Traditional TA analysis complete - Signal: ${analysis.overallSignal}`);
      return analysis;

    } catch (error) {
      console.error('Traditional TA analysis error:', error);
      throw error;
    }
  }

  async calculateAllIndicators(data) {
    const { open, high, low, close, volume } = data;
    const currentPrice = close[close.length - 1];

    console.log('📊 Calculating technical indicators...');

    return {
      // Momentum Indicators
      rsi: RSI.calculate({ values: close, period: this.indicatorPeriods.rsi }),
      
      // Trend Indicators
      macd: MACD.calculate({
        values: close,
        fastPeriod: this.indicatorPeriods.macd.fast,
        slowPeriod: this.indicatorPeriods.macd.slow,
        signalPeriod: this.indicatorPeriods.macd.signal
      }),
      
      // Volatility Indicators
      bollingerBands: BollingerBands.calculate({
        values: close,
        period: this.indicatorPeriods.bollinger.period,
        stdDev: this.indicatorPeriods.bollinger.stdDev
      }),
      
      atr: ATR.calculate({
        high: high,
        low: low,
        close: close,
        period: this.indicatorPeriods.atr
      }),

      // Moving Averages
      sma: {
        5: SMA.calculate({ values: close, period: 5 }),
        10: SMA.calculate({ values: close, period: 10 }),
        20: SMA.calculate({ values: close, period: 20 }),
        50: SMA.calculate({ values: close, period: 50 }),
        200: SMA.calculate({ values: close, period: 200 })
      },
      
      ema: {
        5: EMA.calculate({ values: close, period: 5 }),
        10: EMA.calculate({ values: close, period: 10 }),
        20: EMA.calculate({ values: close, period: 20 }),
        50: EMA.calculate({ values: close, period: 50 }),
        200: EMA.calculate({ values: close, period: 200 })
      },

      // Oscillators
      stochastic: Stochastic.calculate({
        high: high,
        low: low,
        close: close,
        kPeriod: this.indicatorPeriods.stochastic.kPeriod,
        dPeriod: this.indicatorPeriods.stochastic.dPeriod
      }),
      
      williams: WilliamsR.calculate({
        high: high,
        low: low,
        close: close,
        period: this.indicatorPeriods.williams
      }),

      cci: CCI.calculate({
        high: high,
        low: low,
        close: close,
        period: this.indicatorPeriods.cci
      }),

      // Other Indicators
      roc: ROC.calculate({
        values: close,
        period: this.indicatorPeriods.roc
      }),

      obv: OBV.calculate({
        close: close,
        volume: volume
      }),

      adx: ADX.calculate({
        high: high,
        low: low,
        close: close,
        period: this.indicatorPeriods.adx
      }),

      // Statistical measures
      volatility: this.calculateVolatility(close),
      priceStats: this.calculatePriceStatistics(close)
    };
  }

  generateTradingSignals(indicators, ohlcvData) {
    const currentPrice = ohlcvData[ohlcvData.length - 1].close;
    const signals = {};

    // RSI Signals
    const currentRSI = indicators.rsi[indicators.rsi.length - 1];
    signals.rsi = {
      value: currentRSI,
      signal: currentRSI > 70 ? 'SELL' : currentRSI < 30 ? 'BUY' : 'NEUTRAL',
      strength: currentRSI > 80 || currentRSI < 20 ? 'STRONG' : 'WEAK'
    };

    // MACD Signals
    const currentMACD = indicators.macd[indicators.macd.length - 1];
    const prevMACD = indicators.macd[indicators.macd.length - 2];
    signals.macd = {
      value: currentMACD,
      signal: currentMACD?.histogram > 0 ? 'BUY' : 'SELL',
      crossover: this.detectMACDCrossover(currentMACD, prevMACD),
      strength: Math.abs(currentMACD?.histogram || 0) > 0.1 ? 'STRONG' : 'WEAK'
    };

    // Bollinger Bands Signals
    const currentBB = indicators.bollingerBands[indicators.bollingerBands.length - 1];
    signals.bollingerBands = {
      value: currentBB,
      signal: currentPrice < currentBB?.lower ? 'BUY' : 
              currentPrice > currentBB?.upper ? 'SELL' : 'NEUTRAL',
      position: this.calculateBBPosition(currentPrice, currentBB),
      squeeze: this.detectBBSqueeze(indicators.bollingerBands)
    };

    // Moving Average Signals
    signals.movingAverages = this.generateMASignals(indicators, currentPrice);

    // Stochastic Signals
    const currentStoch = indicators.stochastic[indicators.stochastic.length - 1];
    signals.stochastic = {
      value: currentStoch,
      signal: currentStoch?.k > 80 ? 'SELL' : currentStoch?.k < 20 ? 'BUY' : 'NEUTRAL',
      crossover: this.detectStochasticCrossover(indicators.stochastic)
    };

    // Volume Signals
    signals.volume = this.generateVolumeSignals(indicators, ohlcvData);

    // Trend Strength
    signals.trend = this.analyzeTrendStrength(indicators);

    return signals;
  }

  calculateTechnicalScore(indicators, signals) {
    const scores = {
      momentum: 0,
      trend: 0,
      volatility: 0,
      volume: 0,
      overall: 0
    };

    // Momentum Score (RSI, Stochastic, Williams %R)
    scores.momentum = this.calculateMomentumScore(signals);

    // Trend Score (Moving Averages, MACD, ADX)
    scores.trend = this.calculateTrendScore(signals, indicators);

    // Volatility Score (Bollinger Bands, ATR)
    scores.volatility = this.calculateVolatilityScore(indicators, signals);

    // Volume Score (OBV, Volume analysis)
    scores.volume = this.calculateVolumeScore(signals);

    // Overall weighted score
    scores.overall = (
      scores.momentum * 0.3 +
      scores.trend * 0.4 +
      scores.volatility * 0.2 +
      scores.volume * 0.1
    );

    return scores;
  }

  calculateMomentumScore(signals) {
    let score = 50; // Neutral base

    // RSI contribution
    if (signals.rsi.signal === 'BUY') {
      score += signals.rsi.strength === 'STRONG' ? 20 : 10;
    } else if (signals.rsi.signal === 'SELL') {
      score -= signals.rsi.strength === 'STRONG' ? 20 : 10;
    }

    // Stochastic contribution
    if (signals.stochastic.signal === 'BUY') {
      score += 10;
    } else if (signals.stochastic.signal === 'SELL') {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  calculateTrendScore(signals, indicators) {
    let score = 50; // Neutral base

    // Moving average alignment
    const maAlignment = signals.movingAverages.alignment;
    if (maAlignment === 'BULLISH') {
      score += 25;
    } else if (maAlignment === 'BEARISH') {
      score -= 25;
    }

    // MACD contribution
    if (signals.macd.signal === 'BUY') {
      score += signals.macd.strength === 'STRONG' ? 15 : 8;
    } else if (signals.macd.signal === 'SELL') {
      score -= signals.macd.strength === 'STRONG' ? 15 : 8;
    }

    // ADX trend strength
    const currentADX = indicators.adx[indicators.adx.length - 1];
    if (currentADX > 25) {
      score += signals.trend.direction === 'UP' ? 10 : -10;
    }

    return Math.max(0, Math.min(100, score));
  }

  calculateVolatilityScore(indicators, signals) {
    let score = 50; // Neutral base

    // Bollinger Bands position
    if (signals.bollingerBands.position < 0.2) {
      score += 15; // Oversold
    } else if (signals.bollingerBands.position > 0.8) {
      score -= 15; // Overbought
    }

    // ATR volatility assessment
    const currentATR = indicators.atr[indicators.atr.length - 1];
    const avgATR = ss.mean(indicators.atr.slice(-20));
    
    if (currentATR > avgATR * 1.5) {
      score -= 10; // High volatility is risky
    } else if (currentATR < avgATR * 0.5) {
      score += 5; // Low volatility is favorable
    }

    return Math.max(0, Math.min(100, score));
  }

  calculateVolumeScore(signals) {
    let score = 50; // Neutral base

    if (signals.volume.trend === 'INCREASING') {
      score += 15;
    } else if (signals.volume.trend === 'DECREASING') {
      score -= 10;
    }

    if (signals.volume.confirmation === 'CONFIRMED') {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  generateMASignals(indicators, currentPrice) {
    const mas = [];
    
    // Check current price vs all moving averages
    Object.keys(indicators.sma).forEach(period => {
      const smaValue = indicators.sma[period][indicators.sma[period].length - 1];
      const emaValue = indicators.ema[period][indicators.ema[period].length - 1];
      
      mas.push({
        period: period,
        sma: smaValue,
        ema: emaValue,
        aboveSMA: currentPrice > smaValue,
        aboveEMA: currentPrice > emaValue
      });
    });

    // Determine overall alignment
    const bullishCount = mas.filter(ma => ma.aboveSMA && ma.aboveEMA).length;
    const bearishCount = mas.filter(ma => !ma.aboveSMA && !ma.aboveEMA).length;
    
    let alignment = 'NEUTRAL';
    if (bullishCount >= 4) alignment = 'BULLISH';
    else if (bearishCount >= 4) alignment = 'BEARISH';
    else if (bullishCount > bearishCount) alignment = 'WEAK_BULLISH';
    else if (bearishCount > bullishCount) alignment = 'WEAK_BEARISH';

    return {
      data: mas,
      alignment: alignment,
      signal: alignment.includes('BULLISH') ? 'BUY' : 
              alignment.includes('BEARISH') ? 'SELL' : 'NEUTRAL'
    };
  }

  generateVolumeSignals(indicators, ohlcvData) {
    const recentVolumes = ohlcvData.slice(-20).map(d => d.volume);
    const avgVolume = ss.mean(recentVolumes);
    const currentVolume = ohlcvData[ohlcvData.length - 1].volume;
    
    const volumeRatio = currentVolume / avgVolume;
    const obvTrend = this.analyzeTrend(indicators.obv.slice(-10));

    return {
      current: currentVolume,
      average: avgVolume,
      ratio: volumeRatio,
      trend: obvTrend === 1 ? 'INCREASING' : obvTrend === -1 ? 'DECREASING' : 'NEUTRAL',
      confirmation: volumeRatio > 1.5 ? 'CONFIRMED' : volumeRatio > 1.2 ? 'WEAK' : 'UNCONFIRMED',
      signal: obvTrend === 1 && volumeRatio > 1.2 ? 'BUY' : 
              obvTrend === -1 && volumeRatio > 1.2 ? 'SELL' : 'NEUTRAL'
    };
  }

  analyzeTrendStrength(indicators) {
    const currentADX = indicators.adx[indicators.adx.length - 1];
    
    // Simple trend direction based on price vs MA20
    const currentPrice = indicators.ema[20][indicators.ema[20].length - 1];
    const prevPrice = indicators.ema[20][indicators.ema[20].length - 2];
    
    const direction = currentPrice > prevPrice ? 'UP' : 'DOWN';
    
    let strength = 'WEAK';
    if (currentADX > 40) strength = 'VERY_STRONG';
    else if (currentADX > 25) strength = 'STRONG';
    else if (currentADX > 15) strength = 'MODERATE';

    return {
      direction: direction,
      strength: strength,
      adx: currentADX,
      signal: strength === 'STRONG' || strength === 'VERY_STRONG' ? 
              (direction === 'UP' ? 'BUY' : 'SELL') : 'NEUTRAL'
    };
  }

  determineOverallSignal(signals, technicalScore) {
    const score = technicalScore.overall;
    
    if (score >= 75) return 'STRONG_BUY';
    if (score >= 60) return 'BUY';
    if (score >= 55) return 'WEAK_BUY';
    if (score >= 45) return 'NEUTRAL';
    if (score >= 40) return 'WEAK_SELL';
    if (score >= 25) return 'SELL';
    return 'STRONG_SELL';
  }

  calculateConfidence(indicators, signals) {
    let confidence = 0;
    let factors = 0;

    // Signal consensus
    const buySignals = Object.values(signals).filter(s => 
      s.signal === 'BUY' || s.signal === 'STRONG_BUY'
    ).length;
    const sellSignals = Object.values(signals).filter(s => 
      s.signal === 'SELL' || s.signal === 'STRONG_SELL'
    ).length;
    const totalSignals = buySignals + sellSignals;
    
    if (totalSignals > 0) {
      confidence += Math.max(buySignals, sellSignals) / totalSignals * 0.4;
      factors++;
    }

    // Volume confirmation
    if (signals.volume.confirmation === 'CONFIRMED') {
      confidence += 0.3;
    } else if (signals.volume.confirmation === 'WEAK') {
      confidence += 0.15;
    }
    factors++;

    // Trend strength
    if (signals.trend.strength === 'STRONG' || signals.trend.strength === 'VERY_STRONG') {
      confidence += 0.3;
    } else if (signals.trend.strength === 'MODERATE') {
      confidence += 0.15;
    }
    factors++;

    return Math.min(1, confidence / factors);
  }

  calculatePriceTargets(indicators, currentPrice) {
    const atr = indicators.atr[indicators.atr.length - 1];
    const bb = indicators.bollingerBands[indicators.bollingerBands.length - 1];
    
    // Support and resistance based on BB and ATR
    const support1 = Math.min(bb?.lower || currentPrice * 0.95, currentPrice - atr);
    const support2 = currentPrice - (atr * 2);
    const resistance1 = Math.max(bb?.upper || currentPrice * 1.05, currentPrice + atr);
    const resistance2 = currentPrice + (atr * 2);

    return {
      support: [support1, support2],
      resistance: [resistance1, resistance2],
      entry: currentPrice,
      stopLoss: currentPrice - (atr * 1.5),
      takeProfit1: currentPrice + atr,
      takeProfit2: currentPrice + (atr * 2),
      riskReward: (atr * 2) / (atr * 1.5) // Risk/Reward ratio
    };
  }

  calculateRiskAssessment(indicators, ohlcvData) {
    const volatility = indicators.volatility;
    const atr = indicators.atr[indicators.atr.length - 1];
    const currentPrice = ohlcvData[ohlcvData.length - 1].close;
    
    // Risk score based on volatility and technical factors
    let riskScore = 0.5; // Base risk
    
    // Volatility adjustment
    if (volatility > 0.05) riskScore += 0.2; // High volatility
    else if (volatility < 0.02) riskScore -= 0.1; // Low volatility
    
    // ATR-based risk
    const atrPercent = atr / currentPrice;
    if (atrPercent > 0.05) riskScore += 0.15;
    else if (atrPercent < 0.02) riskScore -= 0.1;

    return {
      volatility: volatility,
      atrPercent: atrPercent,
      riskScore: Math.max(0, Math.min(1, riskScore)),
      classification: riskScore > 0.7 ? 'HIGH' : riskScore > 0.4 ? 'MEDIUM' : 'LOW'
    };
  }

  generateRecommendation(signals, technicalScore) {
    const score = technicalScore.overall;
    const overallSignal = this.determineOverallSignal(signals, technicalScore);
    
    let action, reason, positionSize;
    
    switch (overallSignal) {
      case 'STRONG_BUY':
        action = 'BUY';
        reason = 'Strong bullish technical signals across multiple indicators';
        positionSize = 'LARGE';
        break;
      case 'BUY':
        action = 'BUY';
        reason = 'Bullish technical signals indicate upward momentum';
        positionSize = 'NORMAL';
        break;
      case 'WEAK_BUY':
        action = 'BUY';
        reason = 'Weak bullish signals, enter with caution';
        positionSize = 'SMALL';
        break;
      case 'WEAK_SELL':
        action = 'SELL';
        reason = 'Weak bearish signals suggest caution';
        positionSize = 'REDUCE';
        break;
      case 'SELL':
        action = 'SELL';
        reason = 'Bearish technical signals indicate downward pressure';
        positionSize = 'NONE';
        break;
      case 'STRONG_SELL':
        action = 'AVOID';
        reason = 'Strong bearish signals across multiple indicators';
        positionSize = 'NONE';
        break;
      default:
        action = 'HOLD';
        reason = 'Mixed technical signals, maintain current position';
        positionSize = 'CURRENT';
    }

    return {
      action,
      reason,
      positionSize,
      score: score,
      confidence: this.calculateConfidence({}, signals)
    };
  }

  // Helper methods
  calculateVolatility(prices, period = 20) {
    if (prices.length < period) return 0;
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    return ss.standardDeviation(returns.slice(-period));
  }

  calculatePriceStatistics(prices) {
    return {
      mean: ss.mean(prices),
      median: ss.median(prices),
      standardDeviation: ss.standardDeviation(prices),
      variance: ss.variance(prices),
      min: Math.min(...prices),
      max: Math.max(...prices)
    };
  }

  detectMACDCrossover(current, previous) {
    if (!current || !previous) return null;
    
    const currentHistogram = current.histogram;
    const prevHistogram = previous.histogram;
    
    if (prevHistogram <= 0 && currentHistogram > 0) {
      return 'BULLISH_CROSSOVER';
    } else if (prevHistogram >= 0 && currentHistogram < 0) {
      return 'BEARISH_CROSSOVER';
    }
    return null;
  }

  calculateBBPosition(price, bb) {
    if (!bb) return 0.5;
    return (price - bb.lower) / (bb.upper - bb.lower);
  }

  detectBBSqueeze(bbData) {
    if (bbData.length < 20) return false;
    
    const recent = bbData.slice(-20);
    const avgWidth = ss.mean(recent.map(bb => bb.upper - bb.lower));
    const currentWidth = bbData[bbData.length - 1].upper - bbData[bbData.length - 1].lower;
    
    return currentWidth < avgWidth * 0.7; // Squeeze if current width is 70% of average
  }

  detectStochasticCrossover(stochData) {
    if (stochData.length < 2) return null;
    
    const current = stochData[stochData.length - 1];
    const previous = stochData[stochData.length - 2];
    
    if (previous.k <= previous.d && current.k > current.d) {
      return 'BULLISH_CROSSOVER';
    } else if (previous.k >= previous.d && current.k < current.d) {
      return 'BEARISH_CROSSOVER';
    }
    return null;
  }

  analyzeTrend(data) {
    if (data.length < 3) return 0;
    
    const slopes = [];
    for (let i = 1; i < data.length; i++) {
      slopes.push(data[i] - data[i-1]);
    }
    
    const avgSlope = ss.mean(slopes);
    return avgSlope > 0 ? 1 : avgSlope < 0 ? -1 : 0;
  }
}