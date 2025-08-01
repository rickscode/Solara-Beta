import { groq, runCloudflareAI, AI_MODELS, AI_CONFIG } from '../config.js';

export class BaseAgent {
  constructor(modelName, systemPrompt, provider = 'groq') {
    this.modelName = modelName;
    this.systemPrompt = systemPrompt;
    this.provider = provider;
    this.memory = [];
    this.temperature = AI_CONFIG.temperature;
    this.maxTokens = AI_CONFIG.maxTokens;
  }

  async analyze(data, userPrompt) {
    try {
      const prompt = this.createPrompt(data, userPrompt);
      
      if (this.provider === 'groq') {
        return await this.runGroqModel(prompt);
      } else if (this.provider === 'cloudflare') {
        return await this.runCloudflareModel(prompt);
      }
      
      throw new Error(`Unsupported provider: ${this.provider}`);
    } catch (error) {
      console.error(`AI Agent Error (${this.modelName}):`, error);
      throw error;
    }
  }

  async runGroqModel(prompt) {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: prompt }
      ],
      model: this.modelName,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });
    
    return this.parseResponse(completion.choices[0]?.message?.content);
  }

  async runCloudflareModel(prompt) {
    const input = {
      prompt: `${this.systemPrompt}\n\nUser: ${prompt}`,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };
    
    const response = await runCloudflareAI(this.modelName, input);
    return this.parseResponse(response.response || response);
  }

  createPrompt(data, userPrompt) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    return `${userPrompt}\n\nData to analyze:\n${dataStr}`;
  }

  parseResponse(response) {
    try {
      // Try to parse as JSON first
      if (response.includes('{') && response.includes('}')) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      
      // Return as structured object with raw text
      return {
        analysis: response,
        confidence: this.extractConfidence(response),
        recommendation: this.extractRecommendation(response),
        riskScore: this.extractRiskScore(response),
      };
    } catch (error) {
      console.error('Response parsing error:', error);
      return {
        analysis: response,
        confidence: 0.5,
        recommendation: 'UNKNOWN',
        riskScore: 0.5,
      };
    }
  }

  extractConfidence(response) {
    const confidenceMatch = response.match(/confidence[:\s]+(\d+\.?\d*)/i);
    return confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
  }

  extractRecommendation(response) {
    const buyMatch = response.match(/\b(buy|purchase|invest)\b/i);
    const sellMatch = response.match(/\b(sell|exit|avoid)\b/i);
    const holdMatch = response.match(/\b(hold|wait|monitor)\b/i);
    
    if (buyMatch) return 'BUY';
    if (sellMatch) return 'SELL';
    if (holdMatch) return 'HOLD';
    return 'UNKNOWN';
  }

  extractRiskScore(response) {
    const riskMatch = response.match(/risk[:\s]+(\d+\.?\d*)/i);
    return riskMatch ? parseFloat(riskMatch[1]) : 0.5;
  }

  addToMemory(data, response) {
    this.memory.push({
      timestamp: Date.now(),
      data: data,
      response: response,
    });
    
    // Keep only last 10 entries
    if (this.memory.length > 10) {
      this.memory = this.memory.slice(-10);
    }
  }

  getMemoryContext() {
    return this.memory.slice(-3).map(entry => ({
      timestamp: entry.timestamp,
      analysis: entry.response.analysis,
    }));
  }
}

export class MultiModalAgent extends BaseAgent {
  constructor(modelName, systemPrompt, provider = 'cloudflare') {
    super(modelName, systemPrompt, provider);
  }

  async analyzeWithImage(imageBuffer, textData, userPrompt) {
    try {
      if (this.provider === 'cloudflare') {
        const input = {
          image: imageBuffer,
          prompt: `${this.systemPrompt}\n\n${userPrompt}\n\nText context: ${textData}`,
          max_tokens: this.maxTokens,
        };
        
        const response = await runCloudflareAI(this.modelName, input);
        return this.parseResponse(response.response || response);
      } else {
        throw new Error('Image analysis only supported with Cloudflare provider');
      }
    } catch (error) {
      console.error(`MultiModal Agent Error (${this.modelName}):`, error);
      throw error;
    }
  }
}

export class ReasoningAgent extends BaseAgent {
  constructor(modelName = AI_MODELS.REASONING, systemPrompt) {
    super(modelName, systemPrompt, 'groq');
  }

  async reasonAbout(problem, context) {
    const prompt = `
Problem to solve: ${problem}

Context: ${context}

Please provide step-by-step reasoning, showing your work and conclusion.
Format your response as JSON with: reasoning_steps, conclusion, confidence_score
`;
    
    return await this.analyze(context, prompt);
  }
}

export class MathAnalysisAgent extends BaseAgent {
  constructor(modelName = AI_MODELS.MATH_ANALYSIS, systemPrompt) {
    super(modelName, systemPrompt, 'groq');
  }

  async calculateRisk(financialData) {
    const prompt = `
Perform quantitative risk analysis on this financial data.
Calculate risk metrics, probability distributions, and provide mathematical reasoning.
Format response as JSON with: risk_score, probability_metrics, mathematical_reasoning
`;
    
    return await this.analyze(financialData, prompt);
  }
}