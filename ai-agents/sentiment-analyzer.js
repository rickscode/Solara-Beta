import { BaseAgent } from './base-agent.js';
import { AI_MODELS, runCloudflareAI } from '../config.js';

export class SentimentAnalyzer {
  constructor() {
    this.sentimentAgent = new BaseAgent(AI_MODELS.SENTIMENT, `
You are a cryptocurrency sentiment analysis expert.
Analyze social media sentiment and community signals for tokens.

Focus on:
1. Overall sentiment polarity (positive, negative, neutral)
2. Sentiment strength and confidence
3. Key themes and topics in discussions
4. Influencer involvement and impact
5. Community engagement levels
6. FUD vs genuine concerns
7. Hype vs sustainable interest

Provide sentiment scores and actionable insights.
`, 'cloudflare');

    this.fastTextAgent = new BaseAgent(AI_MODELS.FAST_TEXT, `
You are a fast text processor for cryptocurrency social media analysis.
Quickly process and categorize social media content.

Categorize content into:
- Bullish sentiment indicators
- Bearish sentiment indicators  
- Neutral or informational content
- Spam or low-quality content
- Influencer endorsements
- Community discussions

Provide rapid sentiment classification and key insights.
`, 'cloudflare');
  }

  async analyzeSentiment(socialMediaData) {
    try {
      console.log('💬 Starting sentiment analysis...');
      
      // Check if we have any social media data
      if (!socialMediaData || socialMediaData.error || !socialMediaData.platforms) {
        console.log('⚠️  No social media data available, returning neutral sentiment');
        return this.getDefaultSentiment();
      }
      
      // Extract posts from all platforms
      const allPosts = this.extractAllPosts(socialMediaData);
      
      if (allPosts.length === 0) {
        console.log('⚠️  No posts found in social media data, returning neutral sentiment');
        return this.getDefaultSentiment();
      }
      
      // Process individual posts for sentiment
      const sentimentResults = await this.processSentimentBatch(allPosts);
      
      // Get overall sentiment analysis
      const overallAnalysis = await this.sentimentAgent.analyze(
        socialMediaData,
        `Analyze the overall sentiment for this token based on social media data.
         Provide sentiment score (-1 to 1), confidence level, and key themes.
         Focus on genuine community sentiment vs artificial hype.`
      );

      // Get fast classification of content
      const fastAnalysis = await this.fastTextAgent.analyze(
        socialMediaData,
        `Quickly categorize and process this social media content.
         Identify key sentiment drivers and community engagement patterns.`
      );

      // Combine all analyses
      const combinedAnalysis = this.combineAnalyses(sentimentResults, overallAnalysis, fastAnalysis);
      
      console.log(`📊 Sentiment Analysis Complete - Score: ${combinedAnalysis.sentimentScore}`);
      
      return combinedAnalysis;
    } catch (error) {
      console.error('Sentiment Analysis Error:', error);
      return this.getDefaultSentiment('Error during sentiment analysis');
    }
  }

  async processSentimentBatch(posts) {
    const batchSize = 10;
    const results = [];
    
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(post => this.analyzeSinglePost(post))
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  async analyzeSinglePost(post) {
    try {
      const text = post.content || post.text || '';
      
      // Skip empty posts
      if (!text.trim()) {
        return {
          postId: post.id,
          sentiment: 'NEUTRAL',
          confidence: 0.5,
          error: 'Empty post content',
        };
      }
      
      const input = {
        text: text,
      };
      
      const result = await runCloudflareAI(AI_MODELS.SENTIMENT, input);
      
      return {
        postId: post.id,
        content: text,
        sentiment: result.label || 'NEUTRAL',
        confidence: result.score || 0.5,
        author: post.author || 'Unknown',
        timestamp: post.timestamp || Date.now(),
      };
    } catch (error) {
      console.error('Single post analysis error:', error);
      return {
        postId: post.id,
        sentiment: 'NEUTRAL',
        confidence: 0.5,
        error: error.message,
      };
    }
  }

  extractAllPosts(socialMediaData) {
    const posts = [];
    
    if (socialMediaData.platforms) {
      // Extract posts from each platform
      Object.values(socialMediaData.platforms).forEach(platform => {
        if (platform.posts && Array.isArray(platform.posts)) {
          posts.push(...platform.posts);
        }
      });
    }
    
    return posts;
  }

  getDefaultSentiment(reason = 'No social media data available') {
    return {
      sentimentScore: 0,
      sentimentDistribution: { positive: 0, negative: 0, neutral: 1 },
      overallAnalysis: { analysis: reason, confidence: 0.5 },
      fastAnalysis: { analysis: reason, confidence: 0.5 },
      individualPosts: [],
      keyInsights: ['No social media data available for analysis'],
      recommendation: {
        action: 'NEUTRAL',
        reason: reason,
        weight: 'LOW',
      },
      confidence: 0.5,
      timestamp: new Date().toISOString(),
    };
  }

  combineAnalyses(sentimentResults, overallAnalysis, fastAnalysis) {
    // Calculate aggregate sentiment metrics
    const sentimentStats = this.calculateSentimentStats(sentimentResults);
    
    return {
      sentimentScore: sentimentStats.averageScore,
      sentimentDistribution: sentimentStats.distribution,
      overallAnalysis: overallAnalysis,
      fastAnalysis: fastAnalysis,
      individualPosts: sentimentResults,
      keyInsights: this.extractKeyInsights(overallAnalysis, fastAnalysis),
      recommendation: this.generateSentimentRecommendation(sentimentStats),
      confidence: Math.min(overallAnalysis.confidence || 0.5, fastAnalysis.confidence || 0.5),
      timestamp: new Date().toISOString(),
    };
  }

  calculateSentimentStats(results) {
    if (!results || results.length === 0) {
      return {
        averageScore: 0,
        distribution: { positive: 0, negative: 0, neutral: 1 },
        totalPosts: 0,
      };
    }

    const positive = results.filter(r => r.sentiment === 'POSITIVE').length;
    const negative = results.filter(r => r.sentiment === 'NEGATIVE').length;
    const neutral = results.filter(r => r.sentiment === 'NEUTRAL').length;
    const total = results.length;

    // Calculate weighted sentiment score
    const scores = results.map(r => {
      const baseScore = r.sentiment === 'POSITIVE' ? 1 : r.sentiment === 'NEGATIVE' ? -1 : 0;
      return baseScore * r.confidence;
    });

    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      averageScore: Math.round(averageScore * 100) / 100,
      distribution: {
        positive: positive / total,
        negative: negative / total,
        neutral: neutral / total,
      },
      totalPosts: total,
    };
  }

  extractKeyInsights(overallAnalysis, fastAnalysis) {
    const insights = [];
    
    // Extract from overall analysis
    if (overallAnalysis.analysis?.includes('bullish')) {
      insights.push('Strong bullish sentiment detected');
    }
    if (overallAnalysis.analysis?.includes('bearish')) {
      insights.push('Bearish sentiment present');
    }
    if (overallAnalysis.analysis?.includes('hype')) {
      insights.push('Artificial hype detected');
    }
    if (overallAnalysis.analysis?.includes('genuine')) {
      insights.push('Genuine community interest');
    }
    if (overallAnalysis.analysis?.includes('influencer')) {
      insights.push('Influencer activity detected');
    }
    
    // Extract from fast analysis
    if (fastAnalysis.analysis?.includes('spam')) {
      insights.push('Spam content detected');
    }
    if (fastAnalysis.analysis?.includes('engagement')) {
      insights.push('High community engagement');
    }
    
    return insights;
  }

  generateSentimentRecommendation(sentimentStats) {
    const score = sentimentStats.averageScore;
    const positiveRatio = sentimentStats.distribution.positive;
    
    if (score > 0.3 && positiveRatio > 0.6) {
      return {
        action: 'POSITIVE_SIGNAL',
        reason: 'Strong positive sentiment with high community support',
        weight: 'HIGH',
      };
    } else if (score > 0.1 && positiveRatio > 0.4) {
      return {
        action: 'MILD_POSITIVE',
        reason: 'Moderate positive sentiment',
        weight: 'MEDIUM',
      };
    } else if (score < -0.3 && positiveRatio < 0.3) {
      return {
        action: 'NEGATIVE_SIGNAL',
        reason: 'Strong negative sentiment detected',
        weight: 'HIGH',
      };
    } else if (score < -0.1) {
      return {
        action: 'MILD_NEGATIVE',
        reason: 'Some negative sentiment present',
        weight: 'MEDIUM',
      };
    } else {
      return {
        action: 'NEUTRAL',
        reason: 'Balanced or neutral sentiment',
        weight: 'LOW',
      };
    }
  }

  async analyzeInfluencerImpact(influencerData) {
    const prompt = `
Analyze the impact of influencer activity on this token.
Focus on:
- Influencer credibility and follower count
- Message authenticity vs paid promotion
- Historical accuracy of influencer calls
- Community response to influencer content
- Potential for pump and dump schemes

Provide influencer impact assessment and risk factors.
`;
    
    return await this.fastTextAgent.analyze(influencerData, prompt);
  }

  async detectManipulation(socialMediaData) {
    const prompt = `
Detect potential market manipulation in social media content.
Look for:
- Coordinated messaging patterns
- Bot activity indicators
- Artificial sentiment inflation
- Pump and dump signals
- FUD campaigns
- Suspicious account activity

Provide manipulation risk assessment and specific indicators.
`;
    
    return await this.sentimentAgent.analyze(socialMediaData, prompt);
  }

  async trackTrendingTopics(socialMediaData) {
    const prompt = `
Identify trending topics and themes in the social media data.
Extract:
- Most discussed topics
- Emerging themes
- Hashtag trends
- Community concerns
- Positive developments
- News impact on sentiment

Provide trending topic analysis with sentiment implications.
`;
    
    return await this.fastTextAgent.analyze(socialMediaData, prompt);
  }

  getHistoricalSentiment() {
    const sentimentHistory = this.sentimentAgent.getMemoryContext();
    const fastHistory = this.fastTextAgent.getMemoryContext();
    
    return {
      sentimentHistory,
      fastHistory,
      averageSentiment: this.calculateAverageSentiment(sentimentHistory),
    };
  }

  calculateAverageSentiment(history) {
    if (!history || history.length === 0) return 0;
    
    const scores = history.map(h => {
      // Try to extract numerical sentiment score from analysis
      const match = h.analysis?.match(/sentiment[:\s]+(-?\d+\.?\d*)/i);
      return match ? parseFloat(match[1]) : 0;
    });
    
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}