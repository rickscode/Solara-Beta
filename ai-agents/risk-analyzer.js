import { ReasoningAgent, MathAnalysisAgent } from './base-agent.js';
import { AI_MODELS, AI_CONFIG } from '../config.js';

export class RiskAnalyzer {
  constructor() {
    this.reasoningAgent = new ReasoningAgent(AI_MODELS.REASONING, `
You are an expert cryptocurrency risk analyst specializing in Solana tokens. 
Your role is to provide comprehensive risk assessment using logical reasoning.

Key areas to analyze:
1. Liquidity risks and market depth
2. Holder concentration and distribution
3. Contract security and rug pull indicators
4. Market sentiment and social signals
5. Technical analysis patterns
6. Fundamental token economics

Always provide:
- Risk score (0-1 scale, where 0 is safest)
- Specific risk factors identified
- Probability of different outcomes
- Recommended risk mitigation strategies

Format your response as JSON with clear numerical scores and detailed reasoning.
`);

    this.mathAgent = new MathAnalysisAgent(AI_MODELS.MATH_ANALYSIS, `
You are a quantitative analyst specializing in mathematical risk modeling for cryptocurrency tokens.
Focus on numerical analysis, statistical calculations, and mathematical risk metrics.

Calculate:
1. Value at Risk (VaR) estimates
2. Liquidity ratios and depth analysis
3. Volatility metrics and standard deviations
4. Correlation analysis with market indicators
5. Probability distributions for price movements
6. Risk-adjusted return calculations

Provide mathematical reasoning for all calculations and quantitative risk scores.
`);
  }

  async assessRisk(tokenData) {
    try {
      console.log('🔍 Starting comprehensive risk analysis...');
      
      // Parallel analysis using both reasoning and mathematical models
      const [reasoningAnalysis, mathAnalysis] = await Promise.all([
        this.reasoningAgent.reasonAbout(
          'Assess the overall risk of investing in this token',
          tokenData
        ),
        this.mathAgent.calculateRisk(tokenData)
      ]);

      // Combine insights from both analyses
      const combinedAnalysis = this.combineAnalyses(reasoningAnalysis, mathAnalysis);
      
      console.log(`📊 Risk Analysis Complete - Score: ${combinedAnalysis.finalRiskScore}`);
      
      return combinedAnalysis;
    } catch (error) {
      console.error('Risk Analysis Error:', error);
      throw error;
    }
  }

  combineAnalyses(reasoning, math) {
    const reasoningScore = reasoning.riskScore || 0.5;
    const mathScore = math.riskScore || 0.5;
    
    // Weight reasoning slightly higher for crypto analysis
    const finalRiskScore = (reasoningScore * 0.6) + (mathScore * 0.4);
    
    return {
      finalRiskScore: Math.round(finalRiskScore * 100) / 100,
      reasoningAnalysis: reasoning,
      mathematicalAnalysis: math,
      riskFactors: this.extractRiskFactors(reasoning, math),
      recommendation: this.generateRecommendation(finalRiskScore),
      confidence: Math.min(reasoning.confidence || 0.5, math.confidence || 0.5),
      timestamp: new Date().toISOString(),
    };
  }

  extractRiskFactors(reasoning, math) {
    const factors = [];
    
    // Extract from reasoning analysis
    if (reasoning.analysis?.includes('liquidity')) {
      factors.push('Liquidity Risk');
    }
    if (reasoning.analysis?.includes('concentration')) {
      factors.push('Holder Concentration');
    }
    if (reasoning.analysis?.includes('rug')) {
      factors.push('Rug Pull Risk');
    }
    if (reasoning.analysis?.includes('volatility')) {
      factors.push('High Volatility');
    }
    
    // Extract from mathematical analysis
    if (math.analysis?.includes('correlation')) {
      factors.push('Market Correlation');
    }
    if (math.analysis?.includes('deviation')) {
      factors.push('High Standard Deviation');
    }
    
    return [...new Set(factors)]; // Remove duplicates
  }

  generateRecommendation(riskScore) {
    if (riskScore < AI_CONFIG.riskThreshold) {
      return {
        action: 'PROCEED',
        reason: `Low risk score (${riskScore}) below threshold (${AI_CONFIG.riskThreshold})`,
        positionSize: 'NORMAL',
      };
    } else if (riskScore < 0.5) {
      return {
        action: 'CAUTION',
        reason: `Moderate risk score (${riskScore}) requires careful consideration`,
        positionSize: 'REDUCED',
      };
    } else {
      return {
        action: 'AVOID',
        reason: `High risk score (${riskScore}) above safe threshold`,
        positionSize: 'NONE',
      };
    }
  }

  async assessLiquidityRisk(tokenData) {
    const prompt = `
Analyze the liquidity risk specifically for this token.
Focus on:
- Available liquidity depth
- Daily trading volume patterns
- Slippage estimates for different trade sizes
- Liquidity concentration across exchanges
- Exit liquidity scenarios

Provide specific liquidity risk metrics and recommendations.
`;
    
    return await this.mathAgent.analyze(tokenData, prompt);
  }

  async assessRugPullRisk(tokenData) {
    const prompt = `
Evaluate the probability of this token being a rug pull or scam.
Analyze:
- Contract ownership and controls
- Liquidity lock status
- Team transparency and background
- Token distribution patterns
- Historical behavior patterns
- Social media and community signals

Provide rug pull probability and specific red flags.
`;
    
    return await this.reasoningAgent.analyze(tokenData, prompt);
  }

  getHistoricalRiskMetrics() {
    const reasoningHistory = this.reasoningAgent.getMemoryContext();
    const mathHistory = this.mathAgent.getMemoryContext();
    
    return {
      reasoningHistory,
      mathHistory,
      averageRiskScore: this.calculateAverageRiskScore(reasoningHistory, mathHistory),
    };
  }

  calculateAverageRiskScore(reasoning, math) {
    const allScores = [
      ...reasoning.map(r => r.riskScore || 0.5),
      ...math.map(m => m.riskScore || 0.5),
    ];
    
    return allScores.length > 0 
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0.5;
  }
}