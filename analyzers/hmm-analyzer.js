import { Matrix } from 'ml-matrix';
import { kmeans } from 'ml-kmeans';
import * as ss from 'simple-statistics';

/**
 * Hidden Markov Model for Crypto Market Regime Detection
 * Identifies market states: Bull Market, Bear Market, Sideways, High Volatility
 */
export class HMMAnalyzer {
  constructor() {
    this.states = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOLATILITY'];
    this.numStates = this.states.length;
    
    // HMM Parameters (will be learned from data)
    this.transitionMatrix = null;
    this.emissionMatrix = null;
    this.initialProbs = null;
    
    // Model configuration
    this.config = {
      windowSize: 20,
      minTrainingData: 100,
      maxIterations: 50,
      convergenceThreshold: 1e-6
    };
    
    this.isTrained = false;
    this.trainingHistory = [];
  }

  /**
   * Train HMM on historical price data
   * @param {Array} priceData - OHLCV data
   * @returns {Object} Training results
   */
  async trainModel(priceData) {
    try {
      console.log(`🧠 Training HMM on ${priceData.length} data points...`);
      
      if (priceData.length < this.config.minTrainingData) {
        throw new Error(`Insufficient data for HMM training. Need ${this.config.minTrainingData}, got ${priceData.length}`);
      }

      // Feature extraction for HMM
      const features = this.extractHMMFeatures(priceData);
      
      // Discretize observations using K-means clustering
      const observations = this.discretizeObservations(features);
      
      // Initialize HMM parameters
      this.initializeParameters(observations);
      
      // Baum-Welch algorithm for parameter estimation
      const trainingResult = this.baumWelchTraining(observations);
      
      this.isTrained = true;
      this.trainingHistory.push({
        timestamp: new Date().toISOString(),
        dataPoints: priceData.length,
        iterations: trainingResult.iterations,
        finalLikelihood: trainingResult.likelihood,
        convergence: trainingResult.converged
      });

      console.log(`✅ HMM training complete - ${trainingResult.iterations} iterations, likelihood: ${trainingResult.likelihood.toFixed(4)}`);
      
      return {
        success: true,
        iterations: trainingResult.iterations,
        likelihood: trainingResult.likelihood,
        converged: trainingResult.converged,
        states: this.states
      };

    } catch (error) {
      console.error('HMM training error:', error);
      throw error;
    }
  }

  /**
   * Predict current market regime
   * @param {Array} recentData - Recent OHLCV data (last 20-50 points)
   * @returns {Object} Market regime prediction
   */
  async predictMarketRegime(recentData) {
    try {
      if (!this.isTrained) {
        console.log('⚠️ HMM not trained, using heuristic classification');
        return this.heuristicClassification(recentData);
      }

      console.log('🔮 Predicting market regime with HMM...');
      
      // Extract features from recent data
      const features = this.extractHMMFeatures(recentData);
      const observations = this.discretizeObservations(features);
      
      // Viterbi algorithm for most likely state sequence
      const stateSequence = this.viterbiDecode(observations);
      const currentState = stateSequence[stateSequence.length - 1];
      
      // Calculate state probabilities using forward algorithm
      const stateProbs = this.calculateStateProbabilities(observations);
      
      // Predict next state transition probabilities
      const nextStateProbs = this.predictNextState(currentState);
      
      // Calculate regime persistence (how long will this regime last)
      const persistence = this.calculateRegimePersistence(stateSequence);
      
      const prediction = {
        currentRegime: this.states[currentState],
        confidence: Math.max(...stateProbs[stateProbs.length - 1]),
        stateProbabilities: this.states.reduce((obj, state, i) => {
          obj[state] = stateProbs[stateProbs.length - 1][i];
          return obj;
        }, {}),
        nextStateProbabilities: this.states.reduce((obj, state, i) => {
          obj[state] = nextStateProbs[i];
          return obj;
        }, {}),
        persistence: persistence,
        stateSequence: stateSequence.slice(-10).map(s => this.states[s]),
        features: features.slice(-5),
        recommendation: this.generateRegimeBasedRecommendation(currentState, stateProbs[stateProbs.length - 1])
      };

      console.log(`🎯 Market regime: ${prediction.currentRegime} (${(prediction.confidence * 100).toFixed(1)}% confidence)`);
      
      return prediction;

    } catch (error) {
      console.error('HMM prediction error:', error);
      // Fallback to heuristic classification
      return this.heuristicClassification(recentData);
    }
  }

  /**
   * Extract features for HMM observation space
   * @param {Array} priceData 
   * @returns {Array} Feature vectors
   */
  extractHMMFeatures(priceData) {
    const features = [];
    
    for (let i = this.config.windowSize; i < priceData.length; i++) {
      const window = priceData.slice(i - this.config.windowSize, i);
      const closes = window.map(d => d.close);
      const volumes = window.map(d => d.volume);
      const highs = window.map(d => d.high);
      const lows = window.map(d => d.low);
      
      // Calculate returns
      const returns = [];
      for (let j = 1; j < closes.length; j++) {
        returns.push((closes[j] - closes[j-1]) / closes[j-1]);
      }
      
      // Feature vector for this time step
      const featureVector = {
        // Return-based features
        meanReturn: ss.mean(returns),
        returnVolatility: ss.standardDeviation(returns),
        returnSkewness: this.calculateSkewness(returns),
        returnKurtosis: this.calculateKurtosis(returns),
        
        // Price-based features
        priceChange: (closes[closes.length - 1] - closes[0]) / closes[0],
        priceVolatility: ss.standardDeviation(closes) / ss.mean(closes),
        
        // Volume features
        volumeRatio: volumes[volumes.length - 1] / ss.mean(volumes),
        volumeVolatility: ss.standardDeviation(volumes) / ss.mean(volumes),
        
        // Range features
        highLowRatio: highs[highs.length - 1] / lows[lows.length - 1],
        averageRange: ss.mean(highs.map((h, idx) => (h - lows[idx]) / closes[idx])),
        
        // Momentum features
        momentum: this.calculateMomentum(closes),
        rsi: this.calculateSimpleRSI(closes),
        
        timestamp: priceData[i].timestamp
      };
      
      features.push(featureVector);
    }
    
    return features;
  }

  /**
   * Discretize continuous features into discrete observation symbols
   * @param {Array} features 
   * @returns {Array} Discrete observations
   */
  discretizeObservations(features) {
    // Extract key features for clustering
    const featureMatrix = features.map(f => [
      f.meanReturn,
      f.returnVolatility,
      f.priceChange,
      f.volumeRatio,
      f.momentum
    ]);
    
    // Use K-means to cluster observations into discrete symbols
    const numSymbols = 8; // Observation space size
    const kmResult = kmeans(featureMatrix, numSymbols, { maxIterations: 100 });
    
    // Store cluster centers for future use
    this.clusterCenters = kmResult.centroids;
    
    return kmResult.clusters;
  }

  /**
   * Initialize HMM parameters
   * @param {Array} observations 
   */
  initializeParameters(observations) {
    const numSymbols = Math.max(...observations) + 1;
    
    // Initialize transition matrix (uniform)
    this.transitionMatrix = Matrix.ones(this.numStates, this.numStates)
      .mul(1 / this.numStates);
    
    // Initialize emission matrix (uniform)
    this.emissionMatrix = Matrix.ones(this.numStates, numSymbols)
      .mul(1 / numSymbols);
    
    // Initialize state probabilities (uniform)
    this.initialProbs = new Array(this.numStates).fill(1 / this.numStates);
    
    this.numSymbols = numSymbols;
  }

  /**
   * Baum-Welch algorithm for HMM parameter learning
   * @param {Array} observations 
   * @returns {Object} Training results
   */
  baumWelchTraining(observations) {
    let prevLikelihood = -Infinity;
    let iteration = 0;
    
    for (iteration = 0; iteration < this.config.maxIterations; iteration++) {
      // E-step: Forward-Backward algorithm
      const { alpha, beta, likelihood } = this.forwardBackward(observations);
      
      // M-step: Update parameters
      this.updateParameters(observations, alpha, beta);
      
      // Check convergence
      if (Math.abs(likelihood - prevLikelihood) < this.config.convergenceThreshold) {
        return {
          iterations: iteration + 1,
          likelihood: likelihood,
          converged: true
        };
      }
      
      prevLikelihood = likelihood;
    }
    
    return {
      iterations: iteration,
      likelihood: prevLikelihood,
      converged: false
    };
  }

  /**
   * Forward-Backward algorithm
   * @param {Array} observations 
   * @returns {Object} Alpha, beta matrices and likelihood
   */
  forwardBackward(observations) {
    const T = observations.length;
    const N = this.numStates;
    
    // Forward algorithm
    const alpha = Matrix.zeros(T, N);
    
    // Initialize
    for (let i = 0; i < N; i++) {
      alpha.set(0, i, this.initialProbs[i] * this.emissionMatrix.get(i, observations[0]));
    }
    
    // Forward pass
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          sum += alpha.get(t - 1, i) * this.transitionMatrix.get(i, j);
        }
        alpha.set(t, j, sum * this.emissionMatrix.get(j, observations[t]));
      }
    }
    
    // Backward algorithm
    const beta = Matrix.zeros(T, N);
    
    // Initialize
    for (let i = 0; i < N; i++) {
      beta.set(T - 1, i, 1);
    }
    
    // Backward pass
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = 0; j < N; j++) {
          sum += this.transitionMatrix.get(i, j) * 
                 this.emissionMatrix.get(j, observations[t + 1]) * 
                 beta.get(t + 1, j);
        }
        beta.set(t, i, sum);
      }
    }
    
    // Calculate likelihood
    let likelihood = 0;
    for (let i = 0; i < N; i++) {
      likelihood += alpha.get(T - 1, i);
    }
    
    return { alpha, beta, likelihood: Math.log(likelihood) };
  }

  /**
   * Update HMM parameters (M-step)
   * @param {Array} observations 
   * @param {Matrix} alpha 
   * @param {Matrix} beta 
   */
  updateParameters(observations, alpha, beta) {
    const T = observations.length;
    const N = this.numStates;
    
    // Calculate gamma (state probabilities)
    const gamma = Matrix.zeros(T, N);
    for (let t = 0; t < T; t++) {
      let normalizer = 0;
      for (let i = 0; i < N; i++) {
        normalizer += alpha.get(t, i) * beta.get(t, i);
      }
      for (let i = 0; i < N; i++) {
        gamma.set(t, i, (alpha.get(t, i) * beta.get(t, i)) / normalizer);
      }
    }
    
    // Update initial probabilities
    for (let i = 0; i < N; i++) {
      this.initialProbs[i] = gamma.get(0, i);
    }
    
    // Update transition matrix
    for (let i = 0; i < N; i++) {
      let denominator = 0;
      for (let t = 0; t < T - 1; t++) {
        denominator += gamma.get(t, i);
      }
      
      for (let j = 0; j < N; j++) {
        let numerator = 0;
        for (let t = 0; t < T - 1; t++) {
          const xi = (alpha.get(t, i) * this.transitionMatrix.get(i, j) * 
                     this.emissionMatrix.get(j, observations[t + 1]) * 
                     beta.get(t + 1, j)) / (alpha.get(t, i) * beta.get(t, i));
          numerator += xi;
        }
        this.transitionMatrix.set(i, j, numerator / denominator);
      }
    }
    
    // Update emission matrix
    for (let i = 0; i < N; i++) {
      let denominator = 0;
      for (let t = 0; t < T; t++) {
        denominator += gamma.get(t, i);
      }
      
      for (let k = 0; k < this.numSymbols; k++) {
        let numerator = 0;
        for (let t = 0; t < T; t++) {
          if (observations[t] === k) {
            numerator += gamma.get(t, i);
          }
        }
        this.emissionMatrix.set(i, k, numerator / denominator);
      }
    }
  }

  /**
   * Viterbi algorithm for most likely state sequence
   * @param {Array} observations 
   * @returns {Array} Most likely state sequence
   */
  viterbiDecode(observations) {
    const T = observations.length;
    const N = this.numStates;
    
    // Viterbi tables
    const delta = Matrix.zeros(T, N);
    const psi = Matrix.zeros(T, N);
    
    // Initialize
    for (let i = 0; i < N; i++) {
      delta.set(0, i, Math.log(this.initialProbs[i]) + 
                      Math.log(this.emissionMatrix.get(i, observations[0])));
      psi.set(0, i, 0);
    }
    
    // Forward pass
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < N; j++) {
        let maxValue = -Infinity;
        let maxIndex = 0;
        
        for (let i = 0; i < N; i++) {
          const value = delta.get(t - 1, i) + Math.log(this.transitionMatrix.get(i, j));
          if (value > maxValue) {
            maxValue = value;
            maxIndex = i;
          }
        }
        
        delta.set(t, j, maxValue + Math.log(this.emissionMatrix.get(j, observations[t])));
        psi.set(t, j, maxIndex);
      }
    }
    
    // Backward pass (traceback)
    const stateSequence = new Array(T);
    
    // Find best final state
    let maxValue = -Infinity;
    let maxIndex = 0;
    for (let i = 0; i < N; i++) {
      if (delta.get(T - 1, i) > maxValue) {
        maxValue = delta.get(T - 1, i);
        maxIndex = i;
      }
    }
    stateSequence[T - 1] = maxIndex;
    
    // Traceback
    for (let t = T - 2; t >= 0; t--) {
      stateSequence[t] = psi.get(t + 1, stateSequence[t + 1]);
    }
    
    return stateSequence;
  }

  /**
   * Calculate state probabilities using forward algorithm
   * @param {Array} observations 
   * @returns {Array} State probabilities over time
   */
  calculateStateProbabilities(observations) {
    const { alpha } = this.forwardBackward(observations);
    const T = observations.length;
    const N = this.numStates;
    
    const probs = [];
    for (let t = 0; t < T; t++) {
      let normalizer = 0;
      for (let i = 0; i < N; i++) {
        normalizer += alpha.get(t, i);
      }
      
      const timeProbs = [];
      for (let i = 0; i < N; i++) {
        timeProbs.push(alpha.get(t, i) / normalizer);
      }
      probs.push(timeProbs);
    }
    
    return probs;
  }

  /**
   * Predict next state transition probabilities
   * @param {number} currentState 
   * @returns {Array} Next state probabilities
   */
  predictNextState(currentState) {
    const nextProbs = [];
    for (let i = 0; i < this.numStates; i++) {
      nextProbs.push(this.transitionMatrix.get(currentState, i));
    }
    return nextProbs;
  }

  /**
   * Calculate how long the current regime might persist
   * @param {Array} stateSequence 
   * @returns {Object} Persistence metrics
   */
  calculateRegimePersistence(stateSequence) {
    const currentState = stateSequence[stateSequence.length - 1];
    
    // Count consecutive occurrences of current state
    let consecutive = 0;
    for (let i = stateSequence.length - 1; i >= 0; i--) {
      if (stateSequence[i] === currentState) {
        consecutive++;
      } else {
        break;
      }
    }
    
    // Calculate average regime duration from transition matrix
    const selfTransitionProb = this.transitionMatrix.get(currentState, currentState);
    const expectedDuration = 1 / (1 - selfTransitionProb);
    
    return {
      consecutivePeriods: consecutive,
      expectedDuration: expectedDuration,
      probabilityOfContinuation: selfTransitionProb,
      stabilityScore: consecutive / expectedDuration
    };
  }

  /**
   * Generate trading recommendation based on market regime
   * @param {number} currentState 
   * @param {Array} stateProbs 
   * @returns {Object} Regime-based recommendation
   */
  generateRegimeBasedRecommendation(currentState, stateProbs) {
    const regimeName = this.states[currentState];
    const confidence = stateProbs[currentState];
    
    let recommendation = {
      regime: regimeName,
      confidence: confidence,
      action: 'HOLD',
      reasoning: '',
      riskLevel: 'MEDIUM',
      positionSizing: 'NORMAL'
    };
    
    switch (regimeName) {
      case 'BULL':
        recommendation.action = confidence > 0.7 ? 'BUY' : 'WEAK_BUY';
        recommendation.reasoning = 'Bull market regime detected - favorable for long positions';
        recommendation.riskLevel = 'LOW';
        recommendation.positionSizing = confidence > 0.8 ? 'LARGE' : 'NORMAL';
        break;
        
      case 'BEAR':
        recommendation.action = confidence > 0.7 ? 'SELL' : 'WEAK_SELL';
        recommendation.reasoning = 'Bear market regime detected - avoid long positions';
        recommendation.riskLevel = 'HIGH';
        recommendation.positionSizing = 'SMALL';
        break;
        
      case 'SIDEWAYS':
        recommendation.action = 'HOLD';
        recommendation.reasoning = 'Sideways/consolidation regime - wait for breakout';
        recommendation.riskLevel = 'MEDIUM';
        recommendation.positionSizing = 'SMALL';
        break;
        
      case 'HIGH_VOLATILITY':
        recommendation.action = 'CAUTION';
        recommendation.reasoning = 'High volatility regime - reduce position sizes';
        recommendation.riskLevel = 'VERY_HIGH';
        recommendation.positionSizing = 'MINIMAL';
        break;
    }
    
    return recommendation;
  }

  /**
   * Fallback heuristic classification when HMM is not trained
   * @param {Array} recentData 
   * @returns {Object} Heuristic classification
   */
  heuristicClassification(recentData) {
    const closes = recentData.map(d => d.close);
    const volumes = recentData.map(d => d.volume);
    
    // Calculate basic metrics
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i-1]) / closes[i-1]);
    }
    
    const avgReturn = ss.mean(returns);
    const volatility = ss.standardDeviation(returns);
    const priceChange = (closes[closes.length - 1] - closes[0]) / closes[0];
    
    // Simple heuristic rules
    let regime = 'SIDEWAYS';
    let confidence = 0.6;
    
    if (avgReturn > 0.01 && priceChange > 0.05) {
      regime = 'BULL';
      confidence = 0.7;
    } else if (avgReturn < -0.01 && priceChange < -0.05) {
      regime = 'BEAR';
      confidence = 0.7;
    } else if (volatility > 0.05) {
      regime = 'HIGH_VOLATILITY';
      confidence = 0.8;
    }
    
    return {
      currentRegime: regime,
      confidence: confidence,
      stateProbabilities: { [regime]: confidence },
      method: 'HEURISTIC',
      recommendation: this.generateRegimeBasedRecommendation(
        this.states.indexOf(regime), 
        this.states.map(s => s === regime ? confidence : (1 - confidence) / 3)
      )
    };
  }

  // Helper methods
  calculateSkewness(data) {
    const mean = ss.mean(data);
    const std = ss.standardDeviation(data);
    const n = data.length;
    
    const skew = data.reduce((sum, x) => sum + Math.pow((x - mean) / std, 3), 0) / n;
    return skew;
  }

  calculateKurtosis(data) {
    const mean = ss.mean(data);
    const std = ss.standardDeviation(data);
    const n = data.length;
    
    const kurt = data.reduce((sum, x) => sum + Math.pow((x - mean) / std, 4), 0) / n - 3;
    return kurt;
  }

  calculateMomentum(prices) {
    const period = Math.min(10, prices.length - 1);
    if (prices.length < period + 1) return 0;
    
    return (prices[prices.length - 1] - prices[prices.length - 1 - period]) / 
           prices[prices.length - 1 - period];
  }

  calculateSimpleRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    const gains = [];
    const losses = [];
    
    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(-change);
      }
    }
    
    const avgGain = ss.mean(gains);
    const avgLoss = ss.mean(losses);
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Get model information
   * @returns {Object} Model info
   */
  getModelInfo() {
    return {
      states: this.states,
      numStates: this.numStates,
      isTrained: this.isTrained,
      trainingHistory: this.trainingHistory,
      parameters: this.isTrained ? {
        transitionMatrix: this.transitionMatrix.to2DArray(),
        emissionMatrix: this.emissionMatrix.to2DArray(),
        initialProbs: this.initialProbs
      } : null
    };
  }
}