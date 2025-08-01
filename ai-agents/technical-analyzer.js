import { MultiModalAgent, BaseAgent } from './base-agent.js';
import { AI_MODELS } from '../config.js';
import { MLTechnicalAnalyzer } from '../analyzers/ml-technical-analyzer.js';

export class TechnicalAnalyzer {
  constructor() {
    // Initialize ML Technical Analyzer for enhanced analysis
    this.mlAnalyzer = new MLTechnicalAnalyzer();
    
    // Use DeepSeek R1 for technical analysis instead of problematic Cloudflare
    this.technicalAgent = new BaseAgent(AI_MODELS.REASONING, `
You are an expert technical analyst specializing in cryptocurrency chart analysis and technical indicators.
Provide detailed technical analysis based on price data and market metrics.

Focus on:
1. Price action patterns and trends analysis
2. Support and resistance level identification  
3. Volume analysis and confirmation signals
4. Technical indicators assessment (RSI, MACD, moving averages)
5. Market momentum and volatility analysis
6. Breakout and breakdown probability
7. Entry and exit point recommendations

Analyze the provided token data and generate trading signals.
Format as JSON with: overallSignal, confidence, analysis, priceTargets, riskAssessment
`, 'groq');

    this.mathAgent = new BaseAgent(AI_MODELS.MATH_ANALYSIS, `
You are a quantitative analyst specializing in mathematical analysis of cryptocurrency technical data.
Provide precise mathematical and statistical assessment of trading risks and opportunities.

Key responsibilities:
1. Statistical volatility analysis and standard deviation calculations
2. Mathematical risk modeling and probability assessments
3. Quantitative liquidity depth analysis
4. Correlation analysis with market indicators
5. Numerical risk score calculations (0-1 scale)
6. Mathematical price target modeling

Focus on precise numerical analysis and quantitative risk assessment.
Always provide specific numerical risk scores and mathematical reasoning.
`, 'groq');
  }

  async analyzeChart(chartImage, priceData, tokenInfo) {
    try {
      console.log('📈 Starting enhanced ML + AI technical analysis...');
      
      // Try ML analysis first if we have a contract address
      let mlAnalysis = null;
      if (tokenInfo.contractAddress) {
        try {
          console.log('🤖 Running ML Technical Analysis...');
          mlAnalysis = await this.mlAnalyzer.analyzeToken(tokenInfo.contractAddress, {
            primaryTimeframe: '1h'
          });
          console.log('✅ ML analysis completed');
        } catch (mlError) {
          console.log('⚠️ ML analysis failed, falling back to AI-only analysis:', mlError.message);
        }
      }
      
      // Use DeepSeek R1 for comprehensive technical analysis
      const technicalAnalysis = await this.technicalAgent.analyze(
        { ...priceData, ...tokenInfo },
        `Analyze this token's technical indicators and market data for trading signals.
         
         Token: ${tokenInfo.symbol || 'Unknown'}
         Current Price: ${priceData.currentPrice || 'N/A'}
         Market Cap: ${priceData.marketCap || 'N/A'}
         Volume 24h: ${priceData.volume24h || 'N/A'}
         Liquidity: ${priceData.liquidity || 'N/A'}
         Price Change 24h: ${priceData.priceChange24h || 'N/A'}
         
         Provide detailed technical analysis with specific trading recommendations and price targets.`
      );

      // Get mathematical analysis for quantitative insights
      const mathAnalysis = await this.mathAgent.analyze(
        { ...priceData, ...tokenInfo },
        `Perform quantitative mathematical analysis of this token's technical data.
         
         Calculate:
         - Statistical volatility metrics and risk probabilities
         - Liquidity depth analysis and slippage estimates
         - Mathematical correlation with market conditions
         - Numerical risk score (0-1 scale) based on quantitative factors
         - Statistical confidence intervals for price movements
         
         Focus on precise mathematical assessment of trading risks.`
      );

      // Combine AI analyses
      const aiCombinedAnalysis = this.combineAnalyses(technicalAnalysis, mathAnalysis, priceData);
      
      // If ML analysis is available, enhance the results
      if (mlAnalysis) {
        const enhancedAnalysis = this.enhanceWithMLAnalysis(aiCombinedAnalysis, mlAnalysis);
        console.log(`🚀 Enhanced ML + AI Analysis Complete - Signal: ${enhancedAnalysis.overallSignal}`);
        return enhancedAnalysis;
      } else {
        console.log(`📊 AI-Only Technical Analysis Complete - Signal: ${aiCombinedAnalysis.overallSignal}`);
        return aiCombinedAnalysis;
      }
      
    } catch (error) {
      console.error('Technical Analysis Error:', error);
      throw error;
    }
  }

  combineAnalyses(technical, math, priceData) {
    const currentPrice = priceData.currentPrice || 0;
    
    return {
      overallSignal: this.determineOverallSignal(technical, math),
      technicalAnalysis: technical,
      mathAnalysis: math,
      priceTargets: this.calculatePriceTargets(technical, math, currentPrice),
      riskReward: this.calculateRiskReward(technical, math, currentPrice),
      confidence: Math.min(technical.confidence || 0.5, math.confidence || 0.5),
      tradingRecommendation: this.generateTradingRecommendation(technical, math),
      timestamp: new Date().toISOString(),
    };
  }

  determineOverallSignal(technical, math) {
    const technicalSignal = technical.overallSignal || technical.recommendation || 'UNKNOWN';
    const mathSignal = math.recommendation || math.overallSignal || 'UNKNOWN';
    
    // Both agree
    if (technicalSignal === mathSignal) return technicalSignal;
    
    // One is buy, one is hold
    if ((technicalSignal === 'BUY' && mathSignal === 'HOLD') || 
        (technicalSignal === 'HOLD' && mathSignal === 'BUY')) {
      return 'WEAK_BUY';
    }
    
    // One is sell, one is hold
    if ((technicalSignal === 'SELL' && mathSignal === 'HOLD') || 
        (technicalSignal === 'HOLD' && mathSignal === 'SELL')) {
      return 'WEAK_SELL';
    }
    
    // Conflicting signals
    if ((technicalSignal === 'BUY' && mathSignal === 'SELL') || 
        (technicalSignal === 'SELL' && mathSignal === 'BUY')) {
      return 'CONFLICTED';
    }
    
    return 'UNKNOWN';
  }

  calculatePriceTargets(technical, math, currentPrice) {
    const targets = {
      entry: currentPrice,
      stopLoss: currentPrice * 0.85, // Default 15% stop loss
      takeProfit1: currentPrice * 1.25, // 25% profit
      takeProfit2: currentPrice * 1.5,  // 50% profit
      takeProfit3: currentPrice * 1.75, // 75% profit
    };

    // Extract specific levels from analysis if available
    const analysisText = typeof technical.analysis === 'string' ? technical.analysis : 
                        (typeof technical === 'string' ? technical : JSON.stringify(technical));
    
    if (analysisText && analysisText.includes('support')) {
      const supportMatch = analysisText.match(/support[:\s]+(\d+\.?\d*)/i);
      if (supportMatch) {
        targets.stopLoss = Math.max(targets.stopLoss, parseFloat(supportMatch[1]));
      }
    }

    if (analysisText && analysisText.includes('resistance')) {
      const resistanceMatch = analysisText.match(/resistance[:\s]+(\d+\.?\d*)/i);
      if (resistanceMatch) {
        targets.takeProfit1 = Math.min(targets.takeProfit1, parseFloat(resistanceMatch[1]));
      }
    }

    return targets;
  }

  calculateRiskReward(technical, math, currentPrice) {
    const technicalRisk = technical.riskScore || technical.riskAssessment || 0.5;
    const mathRisk = math.riskScore || math.riskAssessment || 0.5;
    const avgRisk = (technicalRisk + mathRisk) / 2;
    
    const potentialGain = 0.25; // 25% default target
    const potentialLoss = 0.15; // 15% default stop loss
    
    return {
      riskScore: avgRisk,
      rewardRatio: potentialGain / potentialLoss,
      expectedValue: (potentialGain * (1 - avgRisk)) - (potentialLoss * avgRisk),
      recommendation: avgRisk < 0.3 ? 'FAVORABLE' : 'UNFAVORABLE',
    };
  }

  /**
   * Enhance AI analysis with ML insights
   * @param {Object} aiAnalysis 
   * @param {Object} mlAnalysis 
   * @returns {Object} Enhanced analysis
   */
  enhanceWithMLAnalysis(aiAnalysis, mlAnalysis) {
    // Combine signals with ML enhancement
    const enhancedSignal = this.combineAIandMLSignals(aiAnalysis.overallSignal, mlAnalysis.overallSignal);
    
    // Enhanced confidence using ML
    const enhancedConfidence = Math.min(0.95, (aiAnalysis.confidence + mlAnalysis.confidence) / 2);
    
    // Enhanced risk assessment
    const mlRiskScore = mlAnalysis.analyses.traditional?.riskAssessment?.riskScore || 0.5;
    const enhancedRiskScore = (aiAnalysis.riskReward.riskScore + mlRiskScore) / 2;
    
    // Enhanced price targets using ML features
    const enhancedPriceTargets = this.enhancePriceTargets(aiAnalysis.priceTargets, mlAnalysis);
    
    return {
      ...aiAnalysis,
      overallSignal: enhancedSignal,
      confidence: enhancedConfidence,
      riskReward: {
        ...aiAnalysis.riskReward,
        riskScore: enhancedRiskScore
      },
      priceTargets: enhancedPriceTargets,
      mlEnhanced: true,
      mlAnalysis: {
        score: mlAnalysis.overallScore,
        confidence: mlAnalysis.confidence,
        features: mlAnalysis.features,
        multiTimeframe: mlAnalysis.analyses.multiTimeframe
      },
      enhancementDetails: {
        aiSignal: aiAnalysis.overallSignal,
        mlSignal: mlAnalysis.overallSignal,
        combinedSignal: enhancedSignal,
        confidenceBoost: enhancedConfidence - aiAnalysis.confidence
      }
    };
  }

  /**
   * Combine AI and ML signals intelligently
   * @param {string} aiSignal 
   * @param {string} mlSignal 
   * @returns {string} Combined signal
   */
  combineAIandMLSignals(aiSignal, mlSignal) {
    // Signal strength mapping
    const signalStrength = {
      'STRONG_BUY': 5,
      'BUY': 4,
      'WEAK_BUY': 3,
      'NEUTRAL': 2,
      'UNKNOWN': 2,
      'WEAK_SELL': 1,
      'SELL': 0,
      'STRONG_SELL': -1
    };
    
    const aiStrength = signalStrength[aiSignal] || 2;
    const mlStrength = signalStrength[mlSignal] || 2;
    
    // Weight ML slightly higher if both agree
    const combinedStrength = (aiStrength * 0.45) + (mlStrength * 0.55);
    
    // Convert back to signal
    if (combinedStrength >= 4.5) return 'STRONG_BUY';
    if (combinedStrength >= 3.5) return 'BUY';
    if (combinedStrength >= 2.5) return 'WEAK_BUY';
    if (combinedStrength >= 1.5) return 'NEUTRAL';
    if (combinedStrength >= 0.5) return 'WEAK_SELL';
    if (combinedStrength >= -0.5) return 'SELL';
    return 'STRONG_SELL';
  }

  /**
   * Enhance price targets with ML insights
   * @param {Object} aiTargets 
   * @param {Object} mlAnalysis 
   * @returns {Object} Enhanced price targets
   */
  enhancePriceTargets(aiTargets, mlAnalysis) {
    const mlPrediction = mlAnalysis.analyses.ml?.priceDirection;
    
    if (mlPrediction && mlPrediction.nextPrice) {
      // Adjust targets based on ML price prediction
      const currentPrice = mlAnalysis.features?.price?.currentPrice || aiTargets.entry;
      const mlPriceChange = (mlPrediction.nextPrice - currentPrice) / currentPrice;
      
      return {
        ...aiTargets,
        takeProfit1: aiTargets.takeProfit1 * (1 + mlPriceChange * 0.5),
        takeProfit2: aiTargets.takeProfit2 * (1 + mlPriceChange * 0.3),
        mlPredictedPrice: mlPrediction.nextPrice,
        mlConfidence: mlPrediction.probability
      };
    }
    
    return aiTargets;
  }

  generateTradingRecommendation(technical, math) {
    const technicalConf = technical.confidence || 0.5;
    const mathConf = math.confidence || 0.5;
    const avgConfidence = (technicalConf + mathConf) / 2;
    
    if (avgConfidence < 0.6) {
      return {
        action: 'WAIT',
        reason: 'Low confidence in technical signals',
        positionSize: 'NONE',
      };
    }
    
    const overallSignal = this.determineOverallSignal(technical, math);
    
    switch (overallSignal) {
      case 'BUY':
        return {
          action: 'BUY',
          reason: 'Strong bullish technical signals',
          positionSize: 'NORMAL',
        };
      case 'WEAK_BUY':
        return {
          action: 'BUY',
          reason: 'Moderate bullish signals',
          positionSize: 'REDUCED',
        };
      case 'SELL':
        return {
          action: 'SELL',
          reason: 'Strong bearish technical signals',
          positionSize: 'NONE',
        };
      case 'WEAK_SELL':
        return {
          action: 'WAIT',
          reason: 'Weak bearish signals, wait for better entry',
          positionSize: 'NONE',
        };
      case 'CONFLICTED':
        return {
          action: 'WAIT',
          reason: 'Conflicting technical signals',
          positionSize: 'NONE',
        };
      default:
        return {
          action: 'WAIT',
          reason: 'Unclear technical signals',
          positionSize: 'NONE',
        };
    }
  }

  async analyzePriceAction(priceData) {
    const prompt = `
Analyze the price action data for trading signals.
Focus on:
- Recent price movements and trends
- Volume patterns and confirmations
- Key support and resistance levels
- Momentum indicators
- Breakout/breakdown patterns

Provide specific trading recommendations with price levels.
`;
    
    return await this.mathAgent.analyze(priceData, prompt);
  }

  async identifyPatterns(chartData) {
    const prompt = `
Identify chart patterns in this data.
Look for:
- Classic patterns (head & shoulders, triangles, flags)
- Candlestick patterns
- Volume patterns
- Trend continuation/reversal signals
- Support/resistance breaks

Provide pattern recognition with probability assessments.
`;
    
    return await this.mathAgent.analyze(chartData, prompt);
  }

  getHistoricalAnalysis() {
    const technicalHistory = this.technicalAgent.getMemoryContext();
    const mathHistory = this.mathAgent.getMemoryContext();
    
    return {
      technicalHistory,
      mathHistory,
      successRate: this.calculateSuccessRate(technicalHistory, mathHistory),
      mlCapabilities: {
        enabled: this.mlAnalyzer !== null,
        models: ['Traditional TA', 'Linear Regression', 'Pattern Recognition'],
        features: ['Multi-timeframe', 'Volume Analysis', 'Statistical Features']
      }
    };
  }

  calculateSuccessRate(technical, math) {
    // Simple success rate calculation based on historical recommendations
    const allRecommendations = [
      ...technical.map(t => t.recommendation),
      ...math.map(m => m.recommendation),
    ];
    
    const buyRecommendations = allRecommendations.filter(r => r === 'BUY').length;
    const totalRecommendations = allRecommendations.length;
    
    return totalRecommendations > 0 ? buyRecommendations / totalRecommendations : 0;
  }
}