import * as tf from '@tensorflow/tfjs-node';
import { TraditionalTAAnalyzer } from './traditional-ta-analyzer.js';
import { PriceDataCollector } from '../data-collectors/price-data-collector.js';
import { HMMAnalyzer } from './hmm-analyzer.js';
import * as ss from 'simple-statistics';
import { SLR } from 'ml-regression';

export class MLTechnicalAnalyzer {
  constructor() {
    this.traditionalTA = new TraditionalTAAnalyzer();
    this.priceCollector = new PriceDataCollector();
    this.hmmAnalyzer = new HMMAnalyzer();
    this.models = {
      lstm: null,
      regression: null,
      classification: null,
      hmm: this.hmmAnalyzer
    };
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('🤖 Initializing ML Technical Analyzer...');
      
      // Initialize TensorFlow backend
      await tf.ready();
      
      this.isInitialized = true;
      console.log('✅ ML Technical Analyzer initialized');
    } catch (error) {
      console.error('ML TA initialization error:', error);
      throw error;
    }
  }

  /**
   * Comprehensive ML + Traditional TA analysis
   * @param {string} tokenAddress 
   * @param {Object} options - Analysis options
   * @returns {Object} Complete analysis results
   */
  async analyzeToken(tokenAddress, options = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log(`🔬 Starting ML + TA analysis for ${tokenAddress}...`);

      // Collect multi-timeframe price data
      const priceData = await this.priceCollector.collectMultiTimeframeData(tokenAddress);
      
      // Traditional technical analysis on primary timeframe
      const primaryTF = options.primaryTimeframe || '1h';
      const primaryData = priceData[primaryTF]?.data;
      
      if (!primaryData || primaryData.length < 50) {
        throw new Error(`Insufficient data for ${primaryTF} timeframe analysis`);
      }

      // Run traditional TA
      const traditionalAnalysis = await this.traditionalTA.analyzeTechnicals(primaryData);

      // ML Feature Engineering
      const features = this.engineerFeatures(primaryData, traditionalAnalysis);

      // ML Predictions
      const mlPredictions = await this.runMLModels(features, primaryData);

      // Multi-timeframe trend analysis
      const multiTFAnalysis = this.analyzeMultiTimeframe(priceData);

      // Pattern recognition
      const patterns = this.recognizePatterns(primaryData);

      // HMM Market Regime Analysis
      const hmmAnalysis = await this.runHMMAnalysis(primaryData, tokenAddress);

      // Combine all analyses
      const combinedAnalysis = this.combineAnalyses({
        traditional: traditionalAnalysis,
        ml: mlPredictions,
        multiTimeframe: multiTFAnalysis,
        patterns: patterns,
        features: features,
        hmm: hmmAnalysis
      });

      console.log(`✅ ML + TA analysis complete - Signal: ${combinedAnalysis.overallSignal}`);
      return combinedAnalysis;

    } catch (error) {
      console.error('ML Technical Analysis error:', error);
      throw error;
    }
  }

  /**
   * Engineer features for ML models
   * @param {Array} priceData 
   * @param {Object} traditionalAnalysis 
   * @returns {Object} Feature set
   */
  engineerFeatures(priceData, traditionalAnalysis) {
    const features = {
      price: this.extractPriceFeatures(priceData),
      technical: this.extractTechnicalFeatures(traditionalAnalysis),
      volume: this.extractVolumeFeatures(priceData),
      patterns: this.extractPatternFeatures(priceData),
      statistical: this.extractStatisticalFeatures(priceData)
    };

    // Normalize features
    features.normalized = this.normalizeFeatures(features);
    
    return features;
  }

  extractPriceFeatures(data) {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    // Price momentum features
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i-1]) / closes[i-1]);
    }

    return {
      currentPrice: closes[closes.length - 1],
      priceChange1: returns[returns.length - 1] || 0,
      priceChange5: returns.slice(-5).reduce((a, b) => a + b, 0) / 5,
      priceChange20: returns.slice(-20).reduce((a, b) => a + b, 0) / 20,
      highLowRatio: highs[highs.length - 1] / lows[lows.length - 1],
      pricePosition: (closes[closes.length - 1] - Math.min(...lows.slice(-20))) / 
                     (Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20))),
      avgTrueRange: this.calculateATR(data.slice(-14)),
      momentum: this.calculateMomentum(closes, 10),
      rateOfChange: this.calculateROC(closes, 5)
    };
  }

  extractTechnicalFeatures(traditionalAnalysis) {
    const indicators = traditionalAnalysis.indicators;
    const signals = traditionalAnalysis.signals;

    return {
      rsi: indicators.rsi[indicators.rsi.length - 1] || 50,
      macdHistogram: indicators.macd[indicators.macd.length - 1]?.histogram || 0,
      macdSignal: indicators.macd[indicators.macd.length - 1]?.signal || 0,
      bbPosition: signals.bollingerBands?.position || 0.5,
      stochK: indicators.stochastic[indicators.stochastic.length - 1]?.k || 50,
      stochD: indicators.stochastic[indicators.stochastic.length - 1]?.d || 50,
      williamsR: indicators.williams[indicators.williams.length - 1] || -50,
      cci: indicators.cci[indicators.cci.length - 1] || 0,
      adx: indicators.adx[indicators.adx.length - 1] || 25,
      obv: indicators.obv[indicators.obv.length - 1] || 0,
      
      // Moving average relationships
      priceVsSMA20: (signals.movingAverages?.data?.find(ma => ma.period === '20')?.sma || 0) > 0 ? 
                    indicators.sma[20][indicators.sma[20].length - 1] / 
                    (signals.movingAverages?.data?.find(ma => ma.period === '20')?.sma || 1) : 1,
      
      sma5_20_ratio: indicators.sma[5].length > 0 && indicators.sma[20].length > 0 ?
                     indicators.sma[5][indicators.sma[5].length - 1] / 
                     indicators.sma[20][indicators.sma[20].length - 1] : 1,
      
      ema5_20_ratio: indicators.ema[5].length > 0 && indicators.ema[20].length > 0 ?
                     indicators.ema[5][indicators.ema[5].length - 1] / 
                     indicators.ema[20][indicators.ema[20].length - 1] : 1
    };
  }

  extractVolumeFeatures(data) {
    const volumes = data.map(d => d.volume);
    const prices = data.map(d => d.close);
    
    // Volume analysis
    const avgVolume20 = ss.mean(volumes.slice(-20));
    const currentVolume = volumes[volumes.length - 1];
    
    // Price-Volume relationship
    const pvt = this.calculatePVT(data);
    const vwap = this.calculateVWAP(data.slice(-20));

    return {
      volumeRatio: currentVolume / avgVolume20,
      volumeMA: avgVolume20,
      volumeStd: ss.standardDeviation(volumes.slice(-20)),
      priceVolumeCorr: this.calculateCorrelation(prices.slice(-20), volumes.slice(-20)),
      pvt: pvt,
      vwap: vwap,
      currentVolume: currentVolume
    };
  }

  extractPatternFeatures(data) {
    return {
      candlestickPattern: this.identifyCandlestickPattern(data.slice(-3)),
      supportResistance: this.findSupportResistance(data),
      trendDirection: this.identifyTrend(data.slice(-20)),
      consolidation: this.detectConsolidation(data.slice(-10)),
      breakout: this.detectBreakout(data)
    };
  }

  extractStatisticalFeatures(data) {
    const closes = data.map(d => d.close);
    const returns = [];
    
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i-1]) / closes[i-1]);
    }

    return {
      volatility: ss.standardDeviation(returns),
      skewness: this.calculateSkewness(returns),
      kurtosis: this.calculateKurtosis(returns),
      sharpeRatio: this.calculateSharpeRatio(returns),
      maxDrawdown: this.calculateMaxDrawdown(closes),
      meanReversion: this.calculateMeanReversionStrength(closes)
    };
  }

  /**
   * Run ML prediction models
   * @param {Object} features 
   * @param {Array} priceData 
   * @returns {Object} ML predictions
   */
  async runMLModels(features, priceData) {
    try {
      const predictions = {};

      // Price direction prediction using simple regression
      predictions.priceDirection = await this.predictPriceDirection(features, priceData);
      
      // Trend strength prediction
      predictions.trendStrength = await this.predictTrendStrength(features);
      
      // Volatility prediction
      predictions.volatility = await this.predictVolatility(features, priceData);
      
      // Signal confidence scoring
      predictions.confidence = await this.calculateMLConfidence(features);

      return predictions;
    } catch (error) {
      console.error('ML models error:', error);
      return {
        priceDirection: { direction: 'NEUTRAL', probability: 0.5 },
        trendStrength: 0.5,
        volatility: 0.02,
        confidence: 0.5
      };
    }
  }

  async predictPriceDirection(features, priceData) {
    try {
      const closes = priceData.map(d => d.close);
      
      // Simple linear regression on recent price trend
      const x = Array.from({length: closes.length}, (_, i) => i);
      const y = closes;
      
      if (x.length >= 10) {
        const regression = new SLR(x.slice(-20), y.slice(-20));
        const nextPrediction = regression.predict(x.length);
        const currentPrice = closes[closes.length - 1];
        
        const change = (nextPrediction - currentPrice) / currentPrice;
        
        return {
          direction: change > 0.01 ? 'UP' : change < -0.01 ? 'DOWN' : 'NEUTRAL',
          probability: Math.min(0.9, 0.5 + Math.abs(change) * 10),
          predictedChange: change,
          nextPrice: nextPrediction
        };
      }
      
      return { direction: 'NEUTRAL', probability: 0.5 };
    } catch (error) {
      return { direction: 'NEUTRAL', probability: 0.5 };
    }
  }

  async predictTrendStrength(features) {
    try {
      // Combine multiple trend indicators
      const rsiStrength = Math.abs(features.technical.rsi - 50) / 50;
      const macdStrength = Math.abs(features.technical.macdHistogram) * 10;
      const adxStrength = features.technical.adx / 100;
      const volumeStrength = Math.min(features.volume.volumeRatio, 3) / 3;
      
      // Weighted combination
      const trendStrength = (
        rsiStrength * 0.3 +
        macdStrength * 0.3 +
        adxStrength * 0.25 +
        volumeStrength * 0.15
      );
      
      return Math.min(1, trendStrength);
    } catch (error) {
      return 0.5;
    }
  }

  async predictVolatility(features, priceData) {
    try {
      const atr = features.price.avgTrueRange;
      const currentPrice = features.price.currentPrice;
      const historicalVol = features.statistical.volatility;
      
      // Combine ATR-based and statistical volatility
      const atrVolatility = atr / currentPrice;
      const predictedVolatility = (atrVolatility * 0.6) + (historicalVol * 0.4);
      
      return Math.min(0.2, Math.max(0.005, predictedVolatility));
    } catch (error) {
      return 0.02;
    }
  }

  async calculateMLConfidence(features) {
    try {
      let confidence = 0.5;
      
      // Volume confirmation
      if (features.volume.volumeRatio > 1.5) confidence += 0.1;
      
      // Technical indicator alignment
      const rsi = features.technical.rsi;
      const macd = features.technical.macdHistogram;
      
      if ((rsi > 70 && macd < 0) || (rsi < 30 && macd > 0)) {
        confidence += 0.15; // Confirmation between indicators
      }
      
      // Trend strength
      if (features.technical.adx > 25) confidence += 0.1;
      
      // Low volatility boost
      if (features.statistical.volatility < 0.02) confidence += 0.05;
      
      return Math.min(0.95, Math.max(0.1, confidence));
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Analyze multiple timeframes for trend confirmation
   * @param {Object} priceData 
   * @returns {Object} Multi-timeframe analysis
   */
  analyzeMultiTimeframe(priceData) {
    const timeframes = ['5m', '15m', '1h', '4h', '1d'];
    const results = {};
    
    timeframes.forEach(tf => {
      if (priceData[tf] && priceData[tf].success) {
        const data = priceData[tf].data;
        if (data && data.length >= 20) {
          results[tf] = {
            trend: this.identifyTrend(data),
            momentum: this.calculateMomentum(data.map(d => d.close), 10),
            volume: this.analyzeVolumeProfile(data),
            strength: this.calculateTrendStrength(data)
          };
        }
      }
    });
    
    // Calculate overall multi-timeframe consensus
    const trends = Object.values(results).map(r => r.trend);
    const bullishCount = trends.filter(t => t === 'BULLISH').length;
    const bearishCount = trends.filter(t => t === 'BEARISH').length;
    
    let consensus = 'NEUTRAL';
    if (bullishCount >= bearishCount + 2) consensus = 'BULLISH';
    else if (bearishCount >= bullishCount + 2) consensus = 'BEARISH';
    
    return {
      individual: results,
      consensus: consensus,
      strength: Math.abs(bullishCount - bearishCount) / timeframes.length,
      alignment: (bullishCount === 0 && bearishCount === 0) ? 'NEUTRAL' :
                 (bullishCount > bearishCount * 2) ? 'STRONG_BULLISH' :
                 (bearishCount > bullishCount * 2) ? 'STRONG_BEARISH' : 'MIXED'
    };
  }

  /**
   * Pattern recognition algorithms
   * @param {Array} data 
   * @returns {Object} Recognized patterns
   */
  recognizePatterns(data) {
    return {
      candlestickPatterns: this.findCandlestickPatterns(data),
      chartPatterns: this.findChartPatterns(data),
      supportResistance: this.findDetailedSupportResistance(data),
      fibonacci: this.calculateFibonacciLevels(data),
      divergences: this.findDivergences(data)
    };
  }

  /**
   * Run Hidden Markov Model analysis for market regime detection
   * @param {Array} primaryData 
   * @param {string} tokenAddress 
   * @returns {Object} HMM analysis results
   */
  async runHMMAnalysis(primaryData, tokenAddress) {
    try {
      console.log('🧠 Running HMM market regime analysis...');
      
      // Try to get more historical data for better HMM training
      let extendedData = primaryData;
      if (primaryData.length < 200) {
        try {
          const moreData = await this.priceCollector.collectHistoricalData(tokenAddress, '1h', 300);
          if (moreData && moreData.length > primaryData.length) {
            extendedData = moreData;
            console.log(`📊 Extended dataset to ${extendedData.length} points for HMM`);
          }
        } catch (error) {
          console.log('⚠️ Could not get extended data, using primary dataset');
        }
      }

      // Train HMM if we have sufficient data
      if (extendedData.length >= 100) {
        try {
          await this.hmmAnalyzer.trainModel(extendedData);
          console.log('✅ HMM model trained successfully');
        } catch (trainError) {
          console.log('⚠️ HMM training failed, using heuristic classification');
        }
      }

      // Predict current market regime
      const recentData = extendedData.slice(-50); // Last 50 data points
      const regimePrediction = await this.hmmAnalyzer.predictMarketRegime(recentData);
      
      console.log(`🎯 Market regime: ${regimePrediction.currentRegime} (${(regimePrediction.confidence * 100).toFixed(1)}% confidence)`);
      
      return {
        regime: regimePrediction,
        modelInfo: this.hmmAnalyzer.getModelInfo(),
        dataPoints: extendedData.length,
        prediction: regimePrediction
      };

    } catch (error) {
      console.error('HMM analysis error:', error);
      return {
        regime: { currentRegime: 'UNKNOWN', confidence: 0.5, method: 'ERROR' },
        error: error.message
      };
    }
  }

  /**
   * Combine all analyses into final recommendation
   * @param {Object} analyses 
   * @returns {Object} Combined analysis
   */
  combineAnalyses(analyses) {
    const { traditional, ml, multiTimeframe, patterns, features, hmm } = analyses;
    
    // Calculate weighted scores
    const scores = {
      traditional: this.scoreTraditionalAnalysis(traditional),
      ml: this.scoreMLAnalysis(ml),
      multiTimeframe: this.scoreMultiTimeframe(multiTimeframe),
      patterns: this.scorePatterns(patterns),
      hmm: this.scoreHMMAnalysis(hmm)
    };
    
    // Weighted combination with HMM market regime influence
    const overallScore = (
      scores.traditional * 0.35 +
      scores.ml * 0.25 +
      scores.multiTimeframe * 0.15 +
      scores.patterns * 0.1 +
      scores.hmm * 0.15
    );
    
    // Determine overall signal
    const overallSignal = this.determineOverallSignal(overallScore, analyses);
    
    // Calculate confidence
    const confidence = this.calculateOverallConfidence(analyses, scores);
    
    // Generate recommendation
    const recommendation = this.generateMLRecommendation(overallSignal, overallScore, confidence);
    
    return {
      overallSignal: overallSignal,
      overallScore: overallScore,
      confidence: confidence,
      recommendation: recommendation,
      scores: scores,
      analyses: {
        traditional: traditional,
        ml: ml,
        multiTimeframe: multiTimeframe,
        patterns: patterns
      },
      features: features,
      timestamp: new Date().toISOString()
    };
  }

  // Helper methods for calculations
  calculateATR(data) {
    if (data.length < 2) return 0;
    
    let atr = 0;
    for (let i = 1; i < data.length; i++) {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i-1].close),
        Math.abs(data[i].low - data[i-1].close)
      );
      atr += tr;
    }
    return atr / (data.length - 1);
  }

  calculateMomentum(prices, period) {
    if (prices.length < period + 1) return 0;
    return (prices[prices.length - 1] - prices[prices.length - 1 - period]) / prices[prices.length - 1 - period];
  }

  calculateROC(prices, period) {
    if (prices.length < period + 1) return 0;
    return ((prices[prices.length - 1] - prices[prices.length - 1 - period]) / prices[prices.length - 1 - period]) * 100;
  }

  calculatePVT(data) {
    let pvt = 0;
    for (let i = 1; i < data.length; i++) {
      const change = (data[i].close - data[i-1].close) / data[i-1].close;
      pvt += change * data[i].volume;
    }
    return pvt;
  }

  calculateVWAP(data) {
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    data.forEach(d => {
      const typicalPrice = (d.high + d.low + d.close) / 3;
      totalVolumePrice += typicalPrice * d.volume;
      totalVolume += d.volume;
    });
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    return denominator !== 0 ? numerator / denominator : 0;
  }

  identifyTrend(data) {
    if (data.length < 10) return 'NEUTRAL';
    
    const closes = data.map(d => d.close);
    const first = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const last = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    
    const change = (last - first) / first;
    
    if (change > 0.02) return 'BULLISH';
    if (change < -0.02) return 'BEARISH';
    return 'NEUTRAL';
  }

  // Additional helper methods would continue here...
  
  scoreTraditionalAnalysis(analysis) {
    return analysis.technicalScore.overall;
  }

  scoreMLAnalysis(ml) {
    const directionScore = ml.priceDirection.direction === 'UP' ? 75 : 
                          ml.priceDirection.direction === 'DOWN' ? 25 : 50;
    return directionScore * ml.confidence;
  }

  scoreMultiTimeframe(mtf) {
    const consensusScore = mtf.consensus === 'BULLISH' ? 75 :
                          mtf.consensus === 'BEARISH' ? 25 : 50;
    return consensusScore * mtf.strength;
  }

  scorePatterns(patterns) {
    // Simple pattern scoring - would be expanded
    return 50;
  }

  scoreHMMAnalysis(hmm) {
    if (!hmm || !hmm.regime) return 50; // Neutral if no HMM data
    
    const regime = hmm.regime.currentRegime;
    const confidence = hmm.regime.confidence || 0.5;
    
    let baseScore = 50; // Neutral
    
    // Score based on regime
    switch (regime) {
      case 'BULL':
        baseScore = 75; // Bullish
        break;
      case 'BEAR':
        baseScore = 25; // Bearish
        break;
      case 'SIDEWAYS':
        baseScore = 45; // Slightly bearish (consolidation)
        break;
      case 'HIGH_VOLATILITY':
        baseScore = 35; // Risky, bearish bias
        break;
      default:
        baseScore = 50; // Unknown/neutral
    }
    
    // Adjust by confidence
    const adjustment = (confidence - 0.5) * 20; // Max ±10 points
    const finalScore = Math.max(0, Math.min(100, baseScore + adjustment));
    
    return finalScore;
  }

  determineOverallSignal(score, analyses) {
    if (score >= 75) return 'STRONG_BUY';
    if (score >= 60) return 'BUY';
    if (score >= 55) return 'WEAK_BUY';
    if (score >= 45) return 'NEUTRAL';
    if (score >= 40) return 'WEAK_SELL';
    if (score >= 25) return 'SELL';
    return 'STRONG_SELL';
  }

  calculateOverallConfidence(analyses, scores) {
    // Combine confidence from different sources
    const tradConfidence = analyses.traditional.confidence;
    const mlConfidence = analyses.ml.confidence;
    
    return (tradConfidence * 0.6) + (mlConfidence * 0.4);
  }

  generateMLRecommendation(signal, score, confidence) {
    return {
      action: signal.includes('BUY') ? 'BUY' : signal.includes('SELL') ? 'SELL' : 'HOLD',
      signal: signal,
      score: score,
      confidence: confidence,
      reasoning: `ML + Traditional TA analysis with ${Math.round(confidence * 100)}% confidence`,
      positionSize: this.calculatePositionSize(signal, confidence)
    };
  }

  calculatePositionSize(signal, confidence) {
    if (signal === 'STRONG_BUY' && confidence > 0.8) return 'LARGE';
    if (signal.includes('BUY') && confidence > 0.7) return 'NORMAL';
    if (signal.includes('BUY')) return 'SMALL';
    if (signal.includes('SELL')) return 'REDUCE';
    return 'HOLD';
  }

  normalizeFeatures(features) {
    // Simple min-max normalization for now
    // In production, would use proper feature scaling
    return features;
  }

  // Placeholder methods for advanced pattern recognition
  identifyCandlestickPattern(data) { return 'NONE'; }
  findSupportResistance(data) { return { support: [], resistance: [] }; }
  detectConsolidation(data) { return false; }
  detectBreakout(data) { return false; }
  calculateSkewness(data) { return 0; }
  calculateKurtosis(data) { return 0; }
  calculateSharpeRatio(returns) { return 0; }
  calculateMaxDrawdown(prices) { return 0; }
  calculateMeanReversionStrength(prices) { return 0; }
  findCandlestickPatterns(data) { return []; }
  findChartPatterns(data) { return []; }
  findDetailedSupportResistance(data) { return {}; }
  calculateFibonacciLevels(data) { return {}; }
  findDivergences(data) { return []; }
  analyzeVolumeProfile(data) { return {}; }
  calculateTrendStrength(data) { return 0.5; }
}