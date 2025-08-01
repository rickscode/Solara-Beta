import { TokenAnalyzer } from './analyzers/token-analyzer.js';
import { TechnicalAnalyzer } from './ai-agents/technical-analyzer.js';

// Quick analysis that bypasses slow/failing components
export class QuickTokenAnalyzer {
  constructor() {
    this.technicalAnalyzer = new TechnicalAnalyzer();
  }

  async quickAnalyze(contractAddress, tokenSymbol = null) {
    console.log(`🚀 Starting QUICK analysis for ${contractAddress}`);
    
    try {
      // Step 1: Get data from DexScreener API
      console.log('📊 Getting token data from DexScreener...');
      const dexData = await this.getDexScreenerData(contractAddress);
      
      if (dexData.error) {
        throw new Error('Could not fetch token data from DexScreener');
      }
      
      // Step 2: Get rugcheck data
      console.log('🔒 Getting rugcheck data...');
      const rugcheckData = await this.getRugcheckData(contractAddress);
      
      // Step 3: Run simplified technical analysis with extracted data
      console.log('📈 Running technical analysis...');
      
      // Generate technical analysis based on extracted data
      const technicalAnalysis = this.generateTechnicalAnalysis(dexData, rugcheckData);
      
      // Step 4: Generate final recommendation
      const recommendation = this.generateQuickRecommendation(dexData, rugcheckData, technicalAnalysis);
      
      console.log('✅ Quick analysis complete');
      
      return {
        contractAddress,
        tokenSymbol,
        dexData,
        rugcheckData,
        technicalAnalysis,
        recommendation,
        timestamp: new Date().toISOString(),
        analysisType: 'quick'
      };
      
    } catch (error) {
      console.error('Quick analysis error:', error);
      throw error;
    }
  }
  
  async getDexScreenerData(contractAddress) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
      const data = await response.json();
      
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs.find(p => p.chainId === 'solana') || data.pairs[0];
        return {
          name: pair.baseToken?.name || 'Unknown',
          symbol: pair.baseToken?.symbol || 'TOKEN',
          price: parseFloat(pair.priceUsd) || 0,
          marketCap: pair.marketCap || 0,
          liquidity: pair.liquidity?.usd || 0,
          volume24h: pair.volume?.h24 || 0,
          priceChange24h: pair.priceChange?.h24 || 0
        };
      }
      
      return { error: 'No token data found' };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  async getRugcheckData(contractAddress) {
    try {
      const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${contractAddress}/report/summary`);
      const data = await response.json();
      
      if (data.error) {
        return { error: data.error, skipped: true };
      }
      
      return data;
    } catch (error) {
      return { error: error.message, skipped: true };
    }
  }
  
  generateTechnicalAnalysis(dexData, rugcheckData) {
    let overallSignal = 'HOLD';
    let confidence = 0.5;
    let analysis = 'Basic technical analysis based on extracted metrics.';
    
    // Analyze Rugcheck Score (most important - lower is better)
    if (rugcheckData && !rugcheckData.error && rugcheckData.score !== undefined) {
      if (rugcheckData.score <= 1) {
        overallSignal = 'BUY';
        confidence += 0.3;
        analysis += ` Excellent rugcheck score (${rugcheckData.score}) indicates low risk.`;
      } else if (rugcheckData.score <= 5) {
        overallSignal = 'WEAK_BUY';
        confidence += 0.1;
        analysis += ` Moderate rugcheck score (${rugcheckData.score}).`;
      } else {
        overallSignal = 'SELL';
        confidence += 0.2;
        analysis += ` High rugcheck score (${rugcheckData.score}) raises security concerns.`;
      }
    } else {
      analysis += ' Rugcheck data unavailable.';
    }
    
    // Analyze price momentum
    if (dexData.priceChange24h > 5) {
      confidence += 0.2;
      analysis += ` Strong positive momentum (+${dexData.priceChange24h}%).`;
      if (overallSignal === 'HOLD') overallSignal = 'WEAK_BUY';
    } else if (dexData.priceChange24h < -5) {
      confidence += 0.1;
      analysis += ` Negative momentum (${dexData.priceChange24h}%).`;
      if (overallSignal === 'BUY') overallSignal = 'WEAK_BUY';
    } else {
      analysis += ` Stable price action (${dexData.priceChange24h}%).`;
    }
    
    // Analyze market metrics
    if (dexData.liquidity > 100000) {
      confidence += 0.1;
      analysis += ` Good liquidity ($${(dexData.liquidity/1000).toFixed(1)}K).`;
    } else {
      analysis += ` Limited liquidity ($${(dexData.liquidity/1000).toFixed(1)}K) - higher volatility risk.`;
    }
    
    if (dexData.volume24h > 50000) {
      confidence += 0.1;
      analysis += ` Active trading volume ($${(dexData.volume24h/1000).toFixed(1)}K).`;
    }
    
    // Normalize confidence
    confidence = Math.max(0.1, Math.min(1, confidence));
    
    return {
      overallSignal,
      confidence: Math.round(confidence * 100) / 100,
      analysis,
      priceTargets: this.generatePriceTargets(dexData, overallSignal),
      riskReward: this.calculateRiskReward(dexData, overallSignal)
    };
  }
  
  generatePriceTargets(dexData, signal) {
    const currentPrice = parseFloat(dexData.price) || 0;
    if (currentPrice === 0) return {};
    
    const targets = {};
    
    if (signal === 'BUY' || signal === 'WEAK_BUY') {
      targets.entry = currentPrice * 0.98; // Slight pullback entry
      targets.takeProfit1 = currentPrice * 1.15; // 15% gain
      targets.takeProfit2 = currentPrice * 1.30; // 30% gain
      targets.stopLoss = currentPrice * 0.85; // 15% stop loss
    } else if (signal === 'SELL') {
      targets.stopLoss = currentPrice * 1.05; // 5% stop loss for shorts
    }
    
    return targets;
  }
  
  calculateRiskReward(dexData, signal) {
    const currentPrice = parseFloat(dexData.price) || 0;
    
    let riskScore = 0.5;
    let rewardRatio = 1;
    
    // Risk assessment based on rugcheck score (lower = better)
    // Default risk if no rugcheck data
    riskScore = 0.6;
    rewardRatio = 1.2;
    
    // Adjust for liquidity
    if (dexData.liquidity < 50000) {
      riskScore += 0.2;
    }
    
    // Adjust for momentum
    if (Math.abs(dexData.priceChange24h) > 10) {
      riskScore += 0.1; // High volatility = higher risk
    }
    
    return {
      riskScore: Math.max(0.1, Math.min(1, riskScore)),
      rewardRatio: Math.max(0.5, Math.min(3, rewardRatio))
    };
  }
  
  generateQuickRecommendation(dexData, rugcheckData, technicalAnalysis) {
    let action = 'HOLD';
    let profitProbability = 0.5;
    let riskScore = 0.5;
    let confidence = 0.5;
    
    // Rugcheck Score analysis (most important - lower is better)
    if (rugcheckData && !rugcheckData.error && rugcheckData.score !== undefined) {
      if (rugcheckData.score <= 1) {
        profitProbability += 0.3;
        riskScore -= 0.2;
        confidence += 0.2;
      } else if (rugcheckData.score <= 5) {
        profitProbability += 0.1;
        riskScore -= 0.1;
        confidence += 0.1;
      } else {
        profitProbability -= 0.2;
        riskScore += 0.3;
        action = 'AVOID';
      }
    } else {
      // No rugcheck data available - treat as moderate risk
      riskScore += 0.1;
    }
    
    // Technical signal analysis
    if (technicalAnalysis.overallSignal === 'BUY') {
      profitProbability += 0.2;
      action = 'BUY';
    } else if (technicalAnalysis.overallSignal === 'SELL') {
      action = 'AVOID';
      riskScore += 0.2;
    }
    
    // Price change analysis
    if (dexData.priceChange24h) {
      const change = parseFloat(dexData.priceChange24h);
      if (change > 10) profitProbability += 0.1;
      if (change < -10) riskScore += 0.2;
    }
    
    // Normalize values
    profitProbability = Math.max(0, Math.min(1, profitProbability));
    riskScore = Math.max(0, Math.min(1, riskScore));
    confidence = Math.max(0, Math.min(1, confidence));
    
    // Final decision
    if (profitProbability >= 0.6 && riskScore <= 0.4) {
      action = 'BUY';
    } else if (riskScore >= 0.7 || profitProbability <= 0.3) {
      action = 'AVOID';
    }
    
    return {
      action,
      profitProbability: Math.round(profitProbability * 100) / 100,
      riskScore: Math.round(riskScore * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: this.generateReasoning(action, dexData, rugcheckData, technicalAnalysis)
    };
  }
  
  generateReasoning(action, dexData, rugcheckData, technicalAnalysis) {
    const reasons = [];
    
    if (rugcheckData && !rugcheckData.error && rugcheckData.score !== undefined) {
      if (rugcheckData.score <= 1) {
        reasons.push(`Excellent rugcheck score (${rugcheckData.score})`);
      } else if (rugcheckData.score > 5) {
        reasons.push(`High rugcheck risk score (${rugcheckData.score})`);
      } else {
        reasons.push(`Moderate rugcheck score (${rugcheckData.score})`);
      }
    } else {
      reasons.push('Rugcheck data unavailable');
    }
    
    if (technicalAnalysis.overallSignal) {
      reasons.push(`Technical signal: ${technicalAnalysis.overallSignal}`);
    }
    
    if (dexData.priceChange24h) {
      const change = parseFloat(dexData.priceChange24h);
      if (change > 5) reasons.push(`Strong positive momentum (+${change}%)`);
      if (change < -5) reasons.push(`Negative momentum (${change}%)`);
    }
    
    return reasons.join(', ') || 'Based on available data analysis';
  }
  
  async close() {
    // No resources to close
  }
}

// Quick analysis function
export const quickAnalyzeToken = async (contractAddress, tokenSymbol = null) => {
  const analyzer = new QuickTokenAnalyzer();
  try {
    return await analyzer.quickAnalyze(contractAddress, tokenSymbol);
  } finally {
    await analyzer.close();
  }
};