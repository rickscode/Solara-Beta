import { RiskAnalyzer } from '../ai-agents/risk-analyzer.js';
import { TechnicalAnalyzer } from '../ai-agents/technical-analyzer.js';
import { SentimentAnalyzer } from '../ai-agents/sentiment-analyzer.js';
import { OverallAnalyzer } from '../ai-agents/overall-analyzer.js';
import { SocialScraper } from '../data-collectors/social-scraper.js';
import { ChartAnalyzer } from './chart-analyzer.js';
import { AI_CONFIG } from '../config.js';

export class TokenAnalyzer {
  constructor() {
    this.riskAnalyzer = new RiskAnalyzer();
    this.technicalAnalyzer = new TechnicalAnalyzer();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.overallAnalyzer = new OverallAnalyzer();
    this.socialScraper = new SocialScraper();
    this.chartAnalyzer = new ChartAnalyzer();
  }

  async analyzeToken(contractAddress, tokenSymbol = null) {
    try {
      console.log(`🔍 Starting comprehensive token analysis for ${contractAddress}`);
      
      // Phase 1: Data Collection
      console.log('📊 Phase 1: Collecting data from multiple sources...');
      const dataCollection = await this.collectAllData(contractAddress, tokenSymbol);
      
      // Phase 2: AI Analysis
      console.log('🤖 Phase 2: Running AI analysis...');
      const aiAnalysis = await this.runAIAnalysis(dataCollection);
      
      // Phase 3: Overall Assessment
      console.log('🎯 Phase 3: Generating final recommendation...');
      const finalAssessment = await this.generateFinalAssessment(aiAnalysis, dataCollection);
      
      console.log(`✅ Token analysis complete - Recommendation: ${finalAssessment.finalRecommendation.action}`);
      
      return {
        contractAddress,
        tokenSymbol,
        dataCollection,
        aiAnalysis,
        finalAssessment,
        timestamp: new Date().toISOString(),
        processingTime: this.calculateProcessingTime(dataCollection.startTime)
      };
    } catch (error) {
      console.error('Token analysis error:', error);
      throw error;
    }
  }

  async collectAllData(contractAddress, tokenSymbol) {
    const startTime = Date.now();
    
    try {
      // Collect data from all sources in parallel
      const [dexScreenerData, socialData, rugcheckData] = await Promise.allSettled([
        this.getDexScreenerData(contractAddress),
        this.collectSocialData(contractAddress, tokenSymbol),
        this.getRugcheckData(contractAddress) // Using existing rugcheck integration
      ]);

      // Get final DexScreener data
      let finalDexData = dexScreenerData.status === 'fulfilled' ? dexScreenerData.value : { error: dexScreenerData.reason };

      return {
        startTime,
        contractAddress,
        tokenSymbol,
        dexscreener: finalDexData,
        social: socialData.status === 'fulfilled' ? socialData.value : { error: socialData.reason },
        rugcheck: rugcheckData.status === 'fulfilled' ? rugcheckData.value : { error: rugcheckData.reason },
        collectionTimestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Data collection error:', error);
      throw error;
    }
  }

  async collectSocialData(contractAddress, tokenSymbol) {
    if (!tokenSymbol) {
      // Use contract address truncated as fallback symbol
      tokenSymbol = contractAddress.substring(0, 8);
    }

    try {
      return await this.socialScraper.scrapeAllPlatforms(tokenSymbol, contractAddress);
    } catch (error) {
      console.warn('Social data collection failed, continuing with empty data:', error.message);
      return {
        platform: 'multi',
        query: tokenSymbol,
        contractAddress: contractAddress,
        platforms: {
          twitter: { posts: [], error: 'Scraping blocked' },
          telegram: { posts: [], error: 'Scraping blocked' },
          reddit: { posts: [], error: 'Scraping blocked' }
        },
        summary: { totalPosts: 0, platformsScraped: 0, errors: ['All platforms blocked'] },
        timestamp: new Date().toISOString()
      };
    }
  }

  async getDexScreenerData(contractAddress) {
    try {
      console.log('📡 Fetching token data from DexScreener API...');
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
      const data = await response.json();
      
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs.find(p => p.chainId === 'solana') || data.pairs[0];
        return {
          name: pair.baseToken?.name || 'Unknown',
          symbol: pair.baseToken?.symbol || 'TOKEN',
          address: contractAddress,
          price: parseFloat(pair.priceUsd) || 0,
          marketCap: pair.marketCap || 0,
          liquidity: pair.liquidity?.usd || 0,
          volume24h: pair.volume?.h24 || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          holders: pair.info?.totalSupply || 0,
          transactions: pair.txns?.h24?.total || 0,
          scrapedAt: new Date().toISOString(),
          source: 'dexscreener_api'
        };
      }
      
      throw new Error('No token data found');
    } catch (error) {
      console.warn('DexScreener API failed:', error.message);
      return { 
        error: 'DexScreener API failed',
        address: contractAddress,
        source: 'failed'
      };
    }
  }

  async getRugcheckData(contractAddress) {
    // Using existing rugcheck integration from the current scripts
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${contractAddress}/report/summary`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // Always try to parse the response, even if status is not ok
      const data = await response.json();
      
      // Handle Rugcheck's "unable to generate report" error (comes with 400 status)
      if (data.error && data.error === "unable to generate report") {
        console.warn(`Rugcheck cannot analyze token ${contractAddress}, continuing without rugcheck data`);
        return { error: data.error, tokenNotSupported: true, skipped: true };
      }
      
      if (!response.ok) {
        console.warn(`Rugcheck API returned ${response.status}, continuing without rugcheck data`);
        return { error: `API returned ${response.status}`, responseData: data, skipped: true };
      }
      
      console.log(`✅ Rugcheck data retrieved for ${contractAddress}`);
      return data;
    } catch (error) {
      console.warn('Rugcheck data unavailable, continuing analysis without it:', error.message);
      return { error: error.message, skipped: true };
    }
  }

  async runAIAnalysis(dataCollection) {
    try {
      // Run all AI analyses in parallel
      const [riskAnalysis, technicalAnalysis, sentimentAnalysis] = await Promise.allSettled([
        this.riskAnalyzer.assessRisk(dataCollection),
        this.analyzeTechnicalData(dataCollection),
        this.sentimentAnalyzer.analyzeSentiment(dataCollection.social)
      ]);

      return {
        risk: riskAnalysis.status === 'fulfilled' ? riskAnalysis.value : { error: riskAnalysis.reason },
        technical: technicalAnalysis.status === 'fulfilled' ? technicalAnalysis.value : { error: technicalAnalysis.reason },
        sentiment: sentimentAnalysis.status === 'fulfilled' ? sentimentAnalysis.value : { error: sentimentAnalysis.reason },
        analysisTimestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI analysis error:', error);
      throw error;
    }
  }

  async analyzeTechnicalData(dataCollection) {
    // If we have chart analysis, use it; otherwise analyze price data
    if (dataCollection.chart && !dataCollection.chart.error) {
      return dataCollection.chart;
    }

    // Fallback to price data analysis
    const priceData = this.extractPriceData(dataCollection.dexscreener);
    const tokenInfo = this.extractTokenInfo(dataCollection.dexscreener);
    
    return await this.technicalAnalyzer.scoutAgent.analyze(
      priceData,
      `Analyze this token's technical indicators and provide trading signals.
       Focus on price action, volume, and momentum indicators.`
    );
  }

  extractPriceData(dexScreenerData) {
    if (dexScreenerData.error) return {};
    
    return {
      currentPrice: dexScreenerData.price,
      volume24h: dexScreenerData.volume24h,
      liquidity: dexScreenerData.liquidity,
      marketCap: dexScreenerData.marketCap,
      priceChange24h: dexScreenerData.priceChange24h,
      holders: dexScreenerData.holders,
      transactions: dexScreenerData.transactions
    };
  }

  extractTokenInfo(dexScreenerData) {
    if (dexScreenerData.error) return {};
    
    return {
      name: dexScreenerData.name,
      symbol: dexScreenerData.symbol,
      address: dexScreenerData.address,
      source: dexScreenerData.source
    };
  }

  async generateFinalAssessment(aiAnalysis, dataCollection) {
    try {
      // Use overall analyzer to make final decision
      const overallAnalysis = await this.overallAnalyzer.analyzeOverall(
        aiAnalysis.risk,
        aiAnalysis.technical,
        aiAnalysis.sentiment,
        dataCollection
      );

      // Calculate comprehensive metrics
      const metrics = this.calculateComprehensiveMetrics(aiAnalysis, dataCollection);
      
      // Generate trading strategy if recommendation is positive
      let tradingStrategy = null;
      if (overallAnalysis.meetsThreshold) {
        tradingStrategy = await this.generateTradingStrategy(overallAnalysis, dataCollection);
      }

      return {
        overallAnalysis,
        metrics,
        tradingStrategy,
        finalRecommendation: overallAnalysis.finalRecommendation,
        meetsThreshold: overallAnalysis.meetsThreshold,
        assessmentTimestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Final assessment error:', error);
      throw error;
    }
  }

  calculateComprehensiveMetrics(aiAnalysis, dataCollection) {
    const metrics = {
      dataQuality: this.calculateDataQuality(dataCollection),
      analysisConfidence: this.calculateAnalysisConfidence(aiAnalysis),
      riskFactors: this.identifyRiskFactors(aiAnalysis, dataCollection),
      opportunityScore: this.calculateOpportunityScore(aiAnalysis),
      marketConditions: this.assessMarketConditions(dataCollection)
    };

    return metrics;
  }

  calculateDataQuality(dataCollection) {
    let score = 0;
    let maxScore = 0;
    
    // DexScreener data quality
    if (dataCollection.dexscreener && !dataCollection.dexscreener.error) {
      score += 40;
      if (dataCollection.dexscreener.price > 0) score += 10;
    }
    maxScore += 50;
    
    // Social data quality
    if (dataCollection.social && !dataCollection.social.error) {
      score += 20;
      if (dataCollection.social.summary.totalPosts > 10) score += 10;
    }
    maxScore += 30;
    
    // Rugcheck data quality
    if (dataCollection.rugcheck && !dataCollection.rugcheck.error) {
      score += 20;
    }
    maxScore += 20;
    
    return {
      score: Math.round((score / maxScore) * 100),
      hasAllData: score === maxScore,
      missingData: this.identifyMissingData(dataCollection)
    };
  }

  calculateAnalysisConfidence(aiAnalysis) {
    const confidences = [];
    
    if (aiAnalysis.risk && aiAnalysis.risk.confidence) {
      confidences.push(aiAnalysis.risk.confidence);
    }
    if (aiAnalysis.technical && aiAnalysis.technical.confidence) {
      confidences.push(aiAnalysis.technical.confidence);
    }
    if (aiAnalysis.sentiment && aiAnalysis.sentiment.confidence) {
      confidences.push(aiAnalysis.sentiment.confidence);
    }
    
    const averageConfidence = confidences.length > 0 ? 
      confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    
    return {
      average: Math.round(averageConfidence * 100),
      individual: {
        risk: aiAnalysis.risk?.confidence || 0,
        technical: aiAnalysis.technical?.confidence || 0,
        sentiment: aiAnalysis.sentiment?.confidence || 0
      },
      reliable: averageConfidence >= AI_CONFIG.confidenceThreshold
    };
  }

  identifyRiskFactors(aiAnalysis, dataCollection) {
    const riskFactors = [];
    
    // Risk analysis factors
    if (aiAnalysis.risk && aiAnalysis.risk.riskFactors) {
      riskFactors.push(...aiAnalysis.risk.riskFactors);
    }
    
    // DexScreener risk indicators (based on low liquidity, volume)
    if (dataCollection.dexscreener && !dataCollection.dexscreener.error) {
      const data = dataCollection.dexscreener;
      if (data.liquidity < 50000) riskFactors.push('low liquidity');
      if (data.volume24h < 10000) riskFactors.push('low volume');
      if (data.priceChange24h < -20) riskFactors.push('large price drop');
    }
    
    // Rugcheck risk factors
    if (dataCollection.rugcheck && dataCollection.rugcheck.risks) {
      riskFactors.push(...dataCollection.rugcheck.risks);
    }
    
    return [...new Set(riskFactors)]; // Remove duplicates
  }

  calculateOpportunityScore(aiAnalysis) {
    let score = 0;
    let factors = 0;
    
    // Risk score (lower is better)
    if (aiAnalysis.risk && aiAnalysis.risk.finalRiskScore) {
      score += (1 - aiAnalysis.risk.finalRiskScore) * 30;
      factors++;
    }
    
    // Technical score
    if (aiAnalysis.technical && aiAnalysis.technical.overallSignal) {
      const technicalScore = this.convertSignalToScore(aiAnalysis.technical.overallSignal);
      score += technicalScore * 40;
      factors++;
    }
    
    // Sentiment score
    if (aiAnalysis.sentiment && aiAnalysis.sentiment.sentimentScore) {
      const normalizedSentiment = (aiAnalysis.sentiment.sentimentScore + 1) / 2; // Convert -1,1 to 0,1
      score += normalizedSentiment * 30;
      factors++;
    }
    
    return factors > 0 ? Math.round(score / factors) : 0;
  }

  convertSignalToScore(signal) {
    switch (signal) {
      case 'BUY': return 1;
      case 'WEAK_BUY': return 0.75;
      case 'HOLD': return 0.5;
      case 'WEAK_SELL': return 0.25;
      case 'SELL': return 0;
      default: return 0.5;
    }
  }

  assessMarketConditions(dataCollection) {
    const dexData = dataCollection.dexscreener;
    
    if (dexData.error) {
      return { condition: 'UNKNOWN', factors: [] };
    }
    
    const factors = [];
    let conditionScore = 0;
    
    // Liquidity assessment
    if (dexData.liquidity > 100000) {
      factors.push('High liquidity');
      conditionScore += 20;
    } else if (dexData.liquidity > 50000) {
      factors.push('Moderate liquidity');
      conditionScore += 10;
    } else {
      factors.push('Low liquidity');
      conditionScore -= 10;
    }
    
    // Volume assessment
    if (dexData.volume24h > 100000) {
      factors.push('High volume');
      conditionScore += 20;
    } else if (dexData.volume24h > 50000) {
      factors.push('Moderate volume');
      conditionScore += 10;
    } else {
      factors.push('Low volume');
      conditionScore -= 10;
    }
    
    // Price performance
    if (dexData.priceChange24h > 10) {
      factors.push('Strong upward momentum');
      conditionScore += 15;
    } else if (dexData.priceChange24h > 0) {
      factors.push('Positive momentum');
      conditionScore += 5;
    } else {
      factors.push('Negative momentum');
      conditionScore -= 5;
    }
    
    let condition = 'NEUTRAL';
    if (conditionScore >= 30) condition = 'FAVORABLE';
    else if (conditionScore <= -10) condition = 'UNFAVORABLE';
    
    return { condition, factors, score: conditionScore };
  }

  async generateTradingStrategy(overallAnalysis, dataCollection) {
    return await this.overallAnalyzer.generateTradingStrategy(overallAnalysis, dataCollection);
  }

  identifyMissingData(dataCollection) {
    const missing = [];
    
    if (dataCollection.dexscreener?.error) missing.push('DexScreener data');
    if (dataCollection.social?.error) missing.push('Social media data');
    if (dataCollection.rugcheck?.error) missing.push('Rugcheck data');
    
    return missing;
  }

  calculateProcessingTime(startTime) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      milliseconds: duration,
      seconds: Math.round(duration / 1000),
      formatted: `${Math.round(duration / 1000)}s`
    };
  }

  async close() {
    await Promise.all([
      this.socialScraper.close()
    ]);
  }
}

// Helper functions
export const createTokenAnalyzer = () => {
  return new TokenAnalyzer();
};

export const analyzeTokenQuick = async (contractAddress, tokenSymbol = null) => {
  const analyzer = new TokenAnalyzer();
  try {
    const analysis = await analyzer.analyzeToken(contractAddress, tokenSymbol);
    return analysis;
  } finally {
    await analyzer.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const tokenAddress = process.argv[2];
  if (!tokenAddress) {
    console.error('Please provide a token address.');
    process.exit(1);
  }

  (async () => {
    const analyzer = new TokenAnalyzer();
    try {
      const analysis = await analyzer.analyzeToken(tokenAddress);
      console.log(JSON.stringify(analysis, null, 2));
    } catch (error) {
      console.error('Analysis failed:', error);
      process.exit(1);
    } finally {
      await analyzer.close();
    }
  })();
}