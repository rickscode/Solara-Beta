import { BaseAgent } from './base-agent.js';
import { AI_MODELS, AI_CONFIG } from '../config.js';

export class OverallAnalyzer {
  constructor() {
    this.insightAgent = new BaseAgent(AI_MODELS.INSIGHTS_SUMMARY, `
You are a master cryptocurrency analyst responsible for making final investment decisions.
Synthesize all available analysis data to provide comprehensive investment recommendations.

Your role:
1. Combine risk analysis, technical analysis, and sentiment analysis
2. Weigh different factors according to their reliability and importance
3. Calculate overall profit probability and risk assessment
4. Provide clear buy/sell/hold recommendations with reasoning
5. Set specific price targets and risk management parameters
6. Ensure recommendations meet minimum profit probability thresholds

Always provide:
- Final recommendation (BUY/SELL/HOLD)
- Profit probability percentage
- Risk score (0-1)
- Confidence level
- Specific entry/exit strategies
- Risk management parameters

Only recommend BUY if profit probability >= 20% and risk score <= 30%.
`, 'groq');
  }

  createCompactSummary(riskAnalysis, technicalAnalysis, sentimentAnalysis, tokenData) {
    return {
      token: {
        address: tokenData.contractAddress,
        symbol: tokenData.tokenSymbol,
        price: tokenData.dataCollection?.dextools?.price,
        marketCap: tokenData.dataCollection?.dextools?.marketCap,
        liquidity: tokenData.dataCollection?.dextools?.liquidity,
        volume24h: tokenData.dataCollection?.dextools?.volume24h,
      },
      risk: {
        score: riskAnalysis?.finalRiskScore || 0.5,
        factors: riskAnalysis?.riskFactors?.slice(0, 3) || [], // Only top 3 factors
        confidence: riskAnalysis?.confidence || 0.5,
      },
      technical: {
        signal: technicalAnalysis?.overallSignal || 'UNKNOWN',
        confidence: technicalAnalysis?.confidence || 0.5,
        priceTargets: technicalAnalysis?.priceTargets || {},
      },
      sentiment: {
        score: sentimentAnalysis?.sentimentScore || 0,
        recommendation: sentimentAnalysis?.recommendation?.action || 'NEUTRAL',
        confidence: sentimentAnalysis?.confidence || 0.5,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async analyzeOverall(riskAnalysis, technicalAnalysis, sentimentAnalysis, tokenData) {
    try {
      console.log('🎯 Starting comprehensive overall analysis...');
      
      // Create a compact summary to avoid token limits
      const compactSummary = this.createCompactSummary(riskAnalysis, technicalAnalysis, sentimentAnalysis, tokenData);

      // Get master analysis from versatile model
      const masterAnalysis = await this.insightAgent.analyze(
        compactSummary,
        `Perform comprehensive analysis of this token investment opportunity.
         
         Consider all factors:
         - Risk assessment and safety factors
         - Technical analysis signals and patterns
         - Social sentiment and community support
         - Token fundamentals and market conditions
         
         Provide final investment recommendation with specific reasoning.
         Calculate profit probability and ensure it meets minimum threshold of 20%.
         
         Format response as JSON with:
         {
           "recommendation": "BUY/SELL/HOLD",
           "profitProbability": 0.XX,
           "riskScore": 0.XX,
           "confidence": 0.XX,
           "reasoning": "detailed explanation",
           "priceTargets": {...},
           "riskManagement": {...}
         }`
      );

      // Calculate weighted scores
      const weightedScores = this.calculateWeightedScores(riskAnalysis, technicalAnalysis, sentimentAnalysis);
      
      // Generate final recommendation
      const finalRecommendation = this.generateFinalRecommendation(masterAnalysis, weightedScores);
      
      console.log(`🎯 Overall Analysis Complete - Recommendation: ${finalRecommendation.action}`);
      
      return {
        masterAnalysis: masterAnalysis,
        weightedScores: weightedScores,
        finalRecommendation: finalRecommendation,
        componentAnalyses: {
          risk: riskAnalysis,
          technical: technicalAnalysis,
          sentiment: sentimentAnalysis,
        },
        meetsThreshold: this.meetsInvestmentThreshold(finalRecommendation),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Overall Analysis Error:', error);
      throw error;
    }
  }

  calculateWeightedScores(riskAnalysis, technicalAnalysis, sentimentAnalysis) {
    // Define weights for different analysis types
    const weights = {
      risk: 0.4,        // Risk analysis is most important
      technical: 0.35,  // Technical analysis is second
      sentiment: 0.25,  // Sentiment analysis is supplementary
    };

    // Extract scores from each analysis
    const riskScore = riskAnalysis.finalRiskScore || 0.5;
    const technicalScore = this.extractTechnicalScore(technicalAnalysis);
    const sentimentScore = (sentimentAnalysis.sentimentScore + 1) / 2; // Convert -1,1 to 0,1
    
    // Calculate weighted overall score (lower is better for risk, higher for others)
    const overallScore = (
      (1 - riskScore) * weights.risk +
      technicalScore * weights.technical +
      sentimentScore * weights.sentiment
    );

    return {
      riskScore: riskScore,
      technicalScore: technicalScore,
      sentimentScore: sentimentScore,
      overallScore: overallScore,
      weights: weights,
    };
  }

  extractTechnicalScore(technicalAnalysis) {
    const signal = technicalAnalysis.overallSignal || 'UNKNOWN';
    const confidence = technicalAnalysis.confidence || 0.5;
    
    // Convert signal to score
    let signalScore = 0.5; // Default neutral
    switch (signal) {
      case 'BUY':
        signalScore = 0.8;
        break;
      case 'WEAK_BUY':
        signalScore = 0.65;
        break;
      case 'HOLD':
        signalScore = 0.5;
        break;
      case 'WEAK_SELL':
        signalScore = 0.35;
        break;
      case 'SELL':
        signalScore = 0.2;
        break;
      case 'CONFLICTED':
        signalScore = 0.4;
        break;
    }
    
    // Weight by confidence
    return signalScore * confidence + 0.5 * (1 - confidence);
  }

  generateFinalRecommendation(masterAnalysis, weightedScores) {
    // Extract key values from master analysis
    const profitProbability = masterAnalysis.profitProbability || 
                            this.estimateProfitProbability(weightedScores);
    const riskScore = masterAnalysis.riskScore || weightedScores.riskScore;
    const confidence = masterAnalysis.confidence || 0.5;
    
    // Apply investment thresholds
    const meetsThreshold = profitProbability >= AI_CONFIG.profitThreshold && 
                          riskScore <= AI_CONFIG.riskThreshold;
    
    let action, reason, positionSize;
    
    if (meetsThreshold && confidence >= AI_CONFIG.confidenceThreshold) {
      action = 'BUY';
      reason = `High profit probability (${Math.round(profitProbability * 100)}%) with acceptable risk (${Math.round(riskScore * 100)}%)`;
      positionSize = this.calculatePositionSize(profitProbability, riskScore, confidence);
    } else if (profitProbability >= AI_CONFIG.profitThreshold * 0.8 && riskScore <= AI_CONFIG.riskThreshold * 1.2) {
      action = 'HOLD';
      reason = 'Moderate opportunity, wait for better entry or more confirmation';
      positionSize = 'REDUCED';
    } else {
      action = 'AVOID';
      reason = `Does not meet thresholds - Profit: ${Math.round(profitProbability * 100)}%, Risk: ${Math.round(riskScore * 100)}%`;
      positionSize = 'NONE';
    }
    
    return {
      action: action,
      reason: reason,
      positionSize: positionSize,
      profitProbability: profitProbability,
      riskScore: riskScore,
      confidence: confidence,
      priceTargets: this.calculatePriceTargets(masterAnalysis),
      riskManagement: this.calculateRiskManagement(masterAnalysis, riskScore),
      timestamp: new Date().toISOString(),
    };
  }

  estimateProfitProbability(weightedScores) {
    // Simple profit probability estimation based on weighted scores
    const baseProb = weightedScores.overallScore;
    
    // Adjust based on risk (lower risk = higher probability)
    const riskAdjustment = (1 - weightedScores.riskScore) * 0.2;
    
    // Ensure within bounds
    return Math.max(0, Math.min(1, baseProb + riskAdjustment));
  }

  calculatePositionSize(profitProbability, riskScore, confidence) {
    // Kelly Criterion inspired position sizing
    const edgeStrength = (profitProbability - 0.5) * 2; // -1 to 1
    const riskAdjustment = 1 - riskScore;
    const confidenceAdjustment = confidence;
    
    const sizeMultiplier = edgeStrength * riskAdjustment * confidenceAdjustment;
    
    if (sizeMultiplier > 0.7) return 'LARGE';
    if (sizeMultiplier > 0.4) return 'NORMAL';
    if (sizeMultiplier > 0.2) return 'SMALL';
    return 'MINIMAL';
  }

  calculatePriceTargets(masterAnalysis) {
    // Extract price targets from master analysis or use defaults
    const currentPrice = masterAnalysis.currentPrice || 1; // Placeholder
    
    return {
      entry: currentPrice,
      stopLoss: currentPrice * 0.85,
      takeProfit1: currentPrice * 1.25,
      takeProfit2: currentPrice * 1.5,
      takeProfit3: currentPrice * 1.75,
      moonTarget: currentPrice * 2.0,
    };
  }

  calculateRiskManagement(masterAnalysis, riskScore) {
    const maxLoss = 0.15; // 15% max loss
    const stopLossAdjustment = riskScore * 0.05; // Tighter stops for higher risk
    
    return {
      maxLossPercentage: maxLoss + stopLossAdjustment,
      positionSizeReduction: riskScore > 0.4 ? 0.5 : 1.0,
      timeLimit: riskScore > 0.5 ? '24h' : '7d',
      emergencyExit: riskScore > 0.6,
    };
  }

  meetsInvestmentThreshold(recommendation) {
    return recommendation.action === 'BUY' && 
           recommendation.profitProbability >= AI_CONFIG.profitThreshold &&
           recommendation.riskScore <= AI_CONFIG.riskThreshold &&
           recommendation.confidence >= AI_CONFIG.confidenceThreshold;
  }

  async generateTradingStrategy(overallAnalysis, tokenData) {
    const prompt = `
Based on this comprehensive analysis, generate a detailed trading strategy.
Include:
- Entry timing and conditions
- Position sizing strategy
- Risk management rules
- Exit strategy with multiple levels
- Contingency plans for different scenarios
- Performance monitoring criteria

Provide actionable trading strategy with specific parameters.
`;
    
    return await this.insightAgent.analyze(overallAnalysis, prompt);
  }

  async assessMarketContext(overallAnalysis, marketData) {
    const prompt = `
Assess how current market conditions affect this investment opportunity.
Consider:
- Overall market sentiment and trends
- Sector-specific conditions
- Correlation with major cryptocurrencies
- Liquidity and volume conditions
- Regulatory environment

Provide market context analysis and timing recommendations.
`;
    
    return await this.insightAgent.analyze({...overallAnalysis, ...marketData}, prompt);
  }

  getHistoricalPerformance() {
    const history = this.insightAgent.getMemoryContext();
    
    return {
      totalRecommendations: history.length,
      buyRecommendations: history.filter(h => h.recommendation === 'BUY').length,
      successRate: this.calculateSuccessRate(history),
      averageConfidence: this.calculateAverageConfidence(history),
    };
  }

  calculateSuccessRate(history) {
    // Simple success rate calculation
    const buyRecs = history.filter(h => h.recommendation === 'BUY').length;
    return history.length > 0 ? buyRecs / history.length : 0;
  }

  calculateAverageConfidence(history) {
    if (!history || history.length === 0) return 0;
    
    const confidences = history.map(h => h.confidence || 0.5);
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }
}