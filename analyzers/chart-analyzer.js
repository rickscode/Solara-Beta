import { TechnicalAnalyzer } from '../ai-agents/technical-analyzer.js';
import { ScreenshotTaker } from '../data-collectors/screenshot-taker.js';
import { promises as fs } from 'fs';

export class ChartAnalyzer {
  constructor() {
    this.technicalAnalyzer = new TechnicalAnalyzer();
    this.screenshotTaker = new ScreenshotTaker();
  }

  async analyzeTokenChart(contractAddress, priceData = {}, tokenInfo = {}) {
    try {
      console.log(`📊 Starting comprehensive chart analysis for ${contractAddress}`);
      
      // Take screenshots from multiple sources
      const screenshots = await this.captureChartScreenshots(contractAddress);
      
      // Analyze each screenshot
      const analysisResults = [];
      
      for (const screenshot of screenshots) {
        if (screenshot.success !== false) {
          try {
            const imageBuffer = await fs.readFile(screenshot.filepath);
            const analysis = await this.technicalAnalyzer.analyzeChart(
              imageBuffer,
              priceData,
              { ...tokenInfo, contractAddress }
            );
            
            analysisResults.push({
              source: screenshot.source,
              screenshot: screenshot,
              analysis: analysis,
              success: true
            });
          } catch (error) {
            console.error(`Failed to analyze ${screenshot.source} screenshot:`, error);
            analysisResults.push({
              source: screenshot.source,
              screenshot: screenshot,
              error: error.message,
              success: false
            });
          }
        }
      }
      
      // Combine all analyses
      const combinedAnalysis = this.combineChartAnalyses(analysisResults);
      
      console.log(`✅ Chart analysis complete - Signal: ${combinedAnalysis.overallSignal}`);
      
      return combinedAnalysis;
    } catch (error) {
      console.error('Chart analysis error:', error);
      throw error;
    }
  }

  async captureChartScreenshots(contractAddress) {
    try {
      // Take screenshots from multiple sources
      const sources = ['dextools', 'tradingview', 'jupiter'];
      const screenshots = await this.screenshotTaker.takeMultipleCharts(contractAddress, sources);
      
      return screenshots;
    } catch (error) {
      console.error('Screenshot capture error:', error);
      // Return empty array if screenshot fails
      return [];
    }
  }

  combineChartAnalyses(analysisResults) {
    const successfulAnalyses = analysisResults.filter(result => result.success);
    
    if (successfulAnalyses.length === 0) {
      return {
        overallSignal: 'UNKNOWN',
        confidence: 0,
        error: 'No successful chart analyses',
        analysisResults: analysisResults
      };
    }

    // Extract signals and confidence scores
    const signals = successfulAnalyses.map(result => ({
      source: result.source,
      signal: result.analysis.overallSignal,
      confidence: result.analysis.confidence,
      analysis: result.analysis
    }));

    // Calculate consensus signal
    const overallSignal = this.calculateConsensusSignal(signals);
    const averageConfidence = this.calculateAverageConfidence(signals);
    
    // Extract price targets and risk metrics
    const priceTargets = this.consolidatePriceTargets(signals);
    const riskMetrics = this.consolidateRiskMetrics(signals);
    
    return {
      overallSignal: overallSignal,
      confidence: averageConfidence,
      priceTargets: priceTargets,
      riskMetrics: riskMetrics,
      sourceAnalyses: signals,
      analysisResults: analysisResults,
      consensus: this.calculateConsensusStrength(signals),
      timestamp: new Date().toISOString()
    };
  }

  calculateConsensusSignal(signals) {
    const signalCounts = {};
    let totalWeight = 0;
    
    // Weight signals by confidence
    signals.forEach(signal => {
      const weight = signal.confidence;
      signalCounts[signal.signal] = (signalCounts[signal.signal] || 0) + weight;
      totalWeight += weight;
    });
    
    // Find signal with highest weighted count
    let maxSignal = 'UNKNOWN';
    let maxWeight = 0;
    
    for (const [signal, weight] of Object.entries(signalCounts)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        maxSignal = signal;
      }
    }
    
    // Require at least 60% consensus
    if (maxWeight / totalWeight >= 0.6) {
      return maxSignal;
    }
    
    return 'CONFLICTED';
  }

  calculateAverageConfidence(signals) {
    if (signals.length === 0) return 0;
    
    const totalConfidence = signals.reduce((sum, signal) => sum + signal.confidence, 0);
    return totalConfidence / signals.length;
  }

  consolidatePriceTargets(signals) {
    const targets = {
      entry: [],
      stopLoss: [],
      takeProfit1: [],
      takeProfit2: [],
      takeProfit3: []
    };
    
    signals.forEach(signal => {
      if (signal.analysis.priceTargets) {
        const pt = signal.analysis.priceTargets;
        if (pt.entry) targets.entry.push(pt.entry);
        if (pt.stopLoss) targets.stopLoss.push(pt.stopLoss);
        if (pt.takeProfit1) targets.takeProfit1.push(pt.takeProfit1);
        if (pt.takeProfit2) targets.takeProfit2.push(pt.takeProfit2);
        if (pt.takeProfit3) targets.takeProfit3.push(pt.takeProfit3);
      }
    });
    
    // Calculate averages
    const consolidatedTargets = {};
    for (const [level, values] of Object.entries(targets)) {
      if (values.length > 0) {
        consolidatedTargets[level] = values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
    
    return consolidatedTargets;
  }

  consolidateRiskMetrics(signals) {
    const riskScores = signals
      .map(signal => signal.analysis.riskReward?.riskScore)
      .filter(score => score !== undefined);
    
    const rewardRatios = signals
      .map(signal => signal.analysis.riskReward?.rewardRatio)
      .filter(ratio => ratio !== undefined);
    
    return {
      averageRiskScore: riskScores.length > 0 ? 
        riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0.5,
      averageRewardRatio: rewardRatios.length > 0 ? 
        rewardRatios.reduce((a, b) => a + b, 0) / rewardRatios.length : 1,
      dataPoints: riskScores.length
    };
  }

  calculateConsensusStrength(signals) {
    const signalMap = {};
    signals.forEach(signal => {
      signalMap[signal.signal] = (signalMap[signal.signal] || 0) + 1;
    });
    
    const maxCount = Math.max(...Object.values(signalMap));
    const consensusPercentage = (maxCount / signals.length) * 100;
    
    return {
      percentage: Math.round(consensusPercentage),
      strength: consensusPercentage >= 80 ? 'STRONG' : 
                consensusPercentage >= 60 ? 'MODERATE' : 'WEAK',
      signalDistribution: signalMap
    };
  }

  async analyzeTimeSeriesCharts(contractAddress, intervals = ['5m', '15m', '1h', '4h', '1d']) {
    try {
      console.log(`📈 Taking time series chart analysis for ${contractAddress}`);
      
      // Take screenshots at different intervals
      const screenshots = await this.screenshotTaker.takeTimeSeriesScreenshots(contractAddress, intervals);
      
      // Analyze each time frame
      const timeFrameAnalyses = [];
      
      for (const screenshot of screenshots) {
        try {
          const imageBuffer = await fs.readFile(screenshot.filepath);
          const analysis = await this.technicalAnalyzer.analyzeChart(
            imageBuffer,
            { timeframe: screenshot.interval },
            { contractAddress }
          );
          
          timeFrameAnalyses.push({
            interval: screenshot.interval,
            screenshot: screenshot,
            analysis: analysis,
            success: true
          });
        } catch (error) {
          console.error(`Failed to analyze ${screenshot.interval} chart:`, error);
          timeFrameAnalyses.push({
            interval: screenshot.interval,
            error: error.message,
            success: false
          });
        }
      }
      
      // Combine multi-timeframe analysis
      const multiTimeframeAnalysis = this.combineTimeFrameAnalyses(timeFrameAnalyses);
      
      return multiTimeframeAnalysis;
    } catch (error) {
      console.error('Time series chart analysis error:', error);
      throw error;
    }
  }

  combineTimeFrameAnalyses(timeFrameAnalyses) {
    const successful = timeFrameAnalyses.filter(analysis => analysis.success);
    
    if (successful.length === 0) {
      return {
        overallTrend: 'UNKNOWN',
        confidence: 0,
        error: 'No successful timeframe analyses'
      };
    }

    // Analyze trend consistency across timeframes
    const trends = successful.map(analysis => ({
      interval: analysis.interval,
      signal: analysis.analysis.overallSignal,
      confidence: analysis.analysis.confidence
    }));

    // Determine overall trend direction
    const overallTrend = this.determineOverallTrend(trends);
    
    // Check for trend alignment
    const alignment = this.checkTrendAlignment(trends);
    
    return {
      overallTrend: overallTrend,
      trendAlignment: alignment,
      timeFrameAnalyses: successful,
      confidence: this.calculateMultiTimeframeConfidence(trends),
      recommendation: this.generateMultiTimeframeRecommendation(overallTrend, alignment),
      timestamp: new Date().toISOString()
    };
  }

  determineOverallTrend(trends) {
    const trendWeights = {
      '5m': 1,
      '15m': 1.5,
      '1h': 2,
      '4h': 2.5,
      '1d': 3
    };
    
    const signalScores = {};
    let totalWeight = 0;
    
    trends.forEach(trend => {
      const weight = trendWeights[trend.interval] || 1;
      const confidence = trend.confidence;
      const adjustedWeight = weight * confidence;
      
      signalScores[trend.signal] = (signalScores[trend.signal] || 0) + adjustedWeight;
      totalWeight += adjustedWeight;
    });
    
    // Find strongest signal
    let maxSignal = 'UNKNOWN';
    let maxScore = 0;
    
    for (const [signal, score] of Object.entries(signalScores)) {
      if (score > maxScore) {
        maxScore = score;
        maxSignal = signal;
      }
    }
    
    return maxSignal;
  }

  checkTrendAlignment(trends) {
    const signals = trends.map(t => t.signal);
    const uniqueSignals = [...new Set(signals)];
    
    const alignmentPercentage = (signals.filter(s => s === this.determineOverallTrend(trends)).length / signals.length) * 100;
    
    return {
      percentage: Math.round(alignmentPercentage),
      strength: alignmentPercentage >= 80 ? 'STRONG' : 
                alignmentPercentage >= 60 ? 'MODERATE' : 'WEAK',
      conflictingSignals: uniqueSignals.length > 2
    };
  }

  calculateMultiTimeframeConfidence(trends) {
    const confidences = trends.map(t => t.confidence);
    const averageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    
    // Boost confidence if multiple timeframes agree
    const alignment = this.checkTrendAlignment(trends);
    const alignmentBoost = alignment.percentage / 100 * 0.2;
    
    return Math.min(1, averageConfidence + alignmentBoost);
  }

  generateMultiTimeframeRecommendation(overallTrend, alignment) {
    if (alignment.strength === 'STRONG' && ['BUY', 'WEAK_BUY'].includes(overallTrend)) {
      return {
        action: 'BUY',
        reason: 'Strong multi-timeframe bullish alignment',
        confidence: 'HIGH'
      };
    } else if (alignment.strength === 'STRONG' && ['SELL', 'WEAK_SELL'].includes(overallTrend)) {
      return {
        action: 'AVOID',
        reason: 'Strong multi-timeframe bearish alignment',
        confidence: 'HIGH'
      };
    } else if (alignment.strength === 'MODERATE') {
      return {
        action: 'CAUTION',
        reason: 'Moderate timeframe alignment, proceed with caution',
        confidence: 'MEDIUM'
      };
    } else {
      return {
        action: 'WAIT',
        reason: 'Conflicting timeframe signals',
        confidence: 'LOW'
      };
    }
  }

  async analyzeTokenChartFromUrl(dexToolsUrl, contractAddress = null) {
    try {
      console.log(`📊 Starting chart analysis from URL: ${dexToolsUrl}`);
      
      // Extract contract address from URL if not provided
      if (!contractAddress) {
        const match = dexToolsUrl.match(/pair-explorer\/([a-zA-Z0-9]+)/);
        contractAddress = match ? match[1] : null;
        
        if (!contractAddress) {
          throw new Error('Could not extract contract address from URL');
        }
      }
      
      console.log(`📊 Extracted contract address: ${contractAddress}`);
      
      // Take screenshot directly from the provided URL
      const screenshot = await this.screenshotTaker.takeScreenshotFromUrl(dexToolsUrl, contractAddress);
      
      if (!screenshot || screenshot.success === false) {
        throw new Error('Failed to capture screenshot from URL');
      }
      
      console.log(`📸 Screenshot captured successfully, now extracting DEX data with AI vision...`);
      
      // Extract DEX data from screenshot using AI vision
      const dexData = await this.extractDexDataFromScreenshot(screenshot.filepath, contractAddress);
      
      // Analyze the screenshot for technical signals
      const imageBuffer = await fs.readFile(screenshot.filepath);
      const analysis = await this.technicalAnalyzer.analyzeChart(
        imageBuffer,
        { source: 'dextools_url' },
        { contractAddress, dexToolsUrl }
      );
      
      console.log(`✅ Chart analysis from URL complete - Signal: ${analysis.overallSignal}`);
      
      return {
        overallSignal: analysis.overallSignal,
        confidence: analysis.confidence,
        priceTargets: analysis.priceTargets,
        riskMetrics: analysis.riskReward,
        screenshot: screenshot,
        analysis: analysis,
        dexData: dexData, // Include extracted DEX data
        contractAddress: contractAddress,
        source: 'dextools_url',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Chart analysis from URL error:', error);
      throw error;
    }
  }

  async extractDexDataFromScreenshot(screenshotPath, contractAddress) {
    try {
      console.log(`🤖 Extracting DEX data from screenshot using AI vision...`);
      
      // Import the AI vision service
      const { runCloudflareAI, AI_MODELS } = await import('../config.js');
      
      // Read the screenshot
      const imageBuffer = await fs.readFile(screenshotPath);
      
      // Use AI vision to extract DEXTools data
      const extractionPrompt = `
CAREFULLY ANALYZE this DEXTools screenshot and extract the EXACT values shown:

LOOK FOR THESE SPECIFIC ELEMENTS:
1. DEX Score - Look for a large circular score display (usually 99/100 or similar) 
2. Token name at the top of the page
3. Token symbol next to the name
4. Current price in USD (usually starts with $)
5. Market cap value
6. Liquidity amount
7. 24h volume
8. Holder count
9. Price change percentage (+ or -)

READ THE ACTUAL VALUES FROM THE SCREENSHOT - DO NOT USE EXAMPLE DATA!

The DEX Score should be visible as a large number in a circular display on the left side.

RESPOND ONLY WITH JSON FORMAT:
{
  "dexScore": [ACTUAL_NUMBER_FROM_SCREENSHOT],
  "name": "[ACTUAL_TOKEN_NAME]",
  "symbol": "[ACTUAL_SYMBOL]", 
  "price": [ACTUAL_PRICE_NUMBER],
  "marketCap": [ACTUAL_MARKET_CAP],
  "liquidity": [ACTUAL_LIQUIDITY],
  "volume24h": [ACTUAL_VOLUME],
  "holders": [ACTUAL_HOLDERS],
  "priceChange24h": [ACTUAL_CHANGE],
  "confidence": 0.95
}

IMPORTANT: Extract the REAL values from the image, not example values!
`;

      // Use Groq's Maverick model for vision analysis instead of Cloudflare
      const { groq } = await import('../config.js');
      
      // Convert image to base64 for Groq
      const base64Image = imageBuffer.toString('base64');
      
      const aiResponse = await groq.chat.completions.create({
        model: AI_MODELS.VISION,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: extractionPrompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      });

      // Parse the AI response from Groq
      let extractedData = null;
      console.log(`🔍 Raw Groq AI Response:`, JSON.stringify(aiResponse, null, 2));
      
      // Handle Groq response format
      const responseText = aiResponse?.choices?.[0]?.message?.content;
      
      if (responseText) {
        console.log(`📝 Groq AI Response Text:`, responseText);
        try {
          // Try to parse JSON from AI response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log(`📋 Extracted JSON:`, jsonMatch[0]);
            extractedData = JSON.parse(jsonMatch[0]);
            console.log(`🎯 Groq AI Vision extracted DEX data:`, extractedData);
          } else {
            console.log(`⚠️  No JSON found in response`);
          }
        } catch (parseError) {
          console.error('Failed to parse Groq AI DEX data response:', parseError);
          console.log('Response that failed to parse:', responseText);
        }
      } else {
        console.log(`❌ No Groq AI response text found`);
        console.log('Available fields:', Object.keys(aiResponse || {}));
      }

      if (extractedData && extractedData.dexScore) {
        console.log(`✅ Successfully extracted DEX Score: ${extractedData.dexScore}`);
        return {
          ...extractedData,
          address: contractAddress,
          scrapedAt: new Date().toISOString(),
          source: 'ai_vision_screenshot'
        };
      } else {
        console.log(`⚠️  Could not extract DEX score from screenshot`);
        return {
          address: contractAddress,
          dexScore: null,
          source: 'ai_vision_failed',
          scrapedAt: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error('AI vision DEX data extraction error:', error);
      return {
        address: contractAddress,
        dexScore: null,
        source: 'ai_vision_error',
        error: error.message,
        scrapedAt: new Date().toISOString()
      };
    }
  }

  async close() {
    await this.screenshotTaker.close();
  }
}

// Helper functions
export const createChartAnalyzer = () => {
  return new ChartAnalyzer();
};

export const analyzeTokenChartQuick = async (contractAddress, priceData = {}, tokenInfo = {}) => {
  const analyzer = new ChartAnalyzer();
  try {
    const analysis = await analyzer.analyzeTokenChart(contractAddress, priceData, tokenInfo);
    return analysis;
  } finally {
    await analyzer.close();
  }
};