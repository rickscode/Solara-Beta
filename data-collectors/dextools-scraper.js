import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';

export class DexToolsScraper {
  constructor(options = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      retries: 3,
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async init() {
    try {
      console.log('🚀 Initializing DEXTools scraper...');
      
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Set viewport
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      console.log('✅ DEXTools scraper initialized');
    } catch (error) {
      console.error('❌ Failed to initialize DEXTools scraper:', error);
      throw error;
    }
  }

  async scrapeTokenData(contractAddress) {
    if (!this.page) {
      await this.init();
    }

    let retries = 0;
    while (retries < this.options.retries) {
      try {
        console.log(`🔍 Scraping DEXTools data for ${contractAddress} (attempt ${retries + 1})`);
        
        const url = `https://www.dextools.io/app/en/solana/pair-explorer/${contractAddress}`;
        
        // Navigate to the page
        await this.page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: this.options.timeout
        });

        // Wait for page to load
        await setTimeout(3000);

        // Try to extract token data
        const tokenData = await this.extractTokenData();
        
        if (tokenData && (tokenData.address || tokenData.name)) {
          tokenData.address = contractAddress; // Ensure address is set
          console.log(`✅ Successfully scraped data for ${tokenData.name || contractAddress}`);
          return tokenData;
        }

        throw new Error('Failed to extract token data');
      } catch (error) {
        console.error(`❌ Attempt ${retries + 1} failed:`, error.message);
        retries++;
        
        if (retries < this.options.retries) {
          await setTimeout(2000 * retries); // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  }

  async scrapeTokenDataFromUrl(dexToolsUrl, contractAddress) {
    console.log(`🔍 Attempting to get DEXTools data from URL: ${dexToolsUrl}`);
    console.log(`⚠️  Web scraping blocked, using screenshot + AI vision approach`);
    
    try {
      // Take screenshot and analyze with AI vision instead of scraping
      const screenshotPath = await this.takeScreenshot(contractAddress);
      
      if (screenshotPath) {
        console.log(`📸 Screenshot taken, analyzing with AI vision...`);
        const aiExtractedData = await this.extractDataFromScreenshot(screenshotPath, contractAddress);
        
        if (aiExtractedData) {
          aiExtractedData.address = contractAddress;
          aiExtractedData.source = 'screenshot_ai_vision';
          console.log(`✅ Successfully extracted data via AI vision for ${aiExtractedData.name || contractAddress}`);
          return aiExtractedData;
        }
      }
      
      // Fallback to basic data structure
      console.log(`⚠️  AI vision extraction failed, using fallback data`);
      return {
        address: contractAddress,
        name: 'Unknown Token',
        symbol: contractAddress.substring(0, 8),
        source: 'screenshot_fallback',
        scrapedAt: new Date().toISOString(),
        dexScore: null,
        price: null,
        marketCap: null,
        liquidity: null,
        volume24h: null,
        holders: null
      };
      
    } catch (error) {
      console.error(`❌ Screenshot analysis failed:`, error.message);
      // Return basic fallback data
      return {
        address: contractAddress,
        name: 'Unknown Token',
        symbol: contractAddress.substring(0, 8),
        source: 'error_fallback',
        error: error.message,
        scrapedAt: new Date().toISOString()
      };
    }
  }

  async extractDataFromScreenshot(screenshotPath, contractAddress) {
    try {
      // Import the AI vision service
      const { runCloudflareAI, AI_MODELS } = await import('../config.js');
      const fs = await import('fs');
      
      // Read the screenshot
      const imageBuffer = await fs.promises.readFile(screenshotPath);
      
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
  "name": "[ACTUAL_TOKEN_NAME]",
  "symbol": "[ACTUAL_SYMBOL]",
  "dexScore": [ACTUAL_NUMBER_FROM_SCREENSHOT],
  "price": [ACTUAL_PRICE_NUMBER],
  "marketCap": [ACTUAL_MARKET_CAP],
  "liquidity": [ACTUAL_LIQUIDITY],
  "volume24h": [ACTUAL_VOLUME],
  "holders": [ACTUAL_HOLDERS],
  "priceChange24h": [ACTUAL_CHANGE],
  "riskIndicators": [],
  "confidence": 0.95
}

IMPORTANT: Extract the REAL values from the image, not example values!
`;

      const aiResponse = await runCloudflareAI(AI_MODELS.VISION, {
        image: Array.from(imageBuffer),
        prompt: extractionPrompt,
        max_tokens: 1000
      });

      // Parse the AI response
      let extractedData = null;
      if (aiResponse && aiResponse.response) {
        try {
          // Try to parse JSON from AI response
          const jsonMatch = aiResponse.response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error('Failed to parse AI response as JSON:', parseError);
        }
      }

      if (extractedData) {
        console.log(`🤖 AI Vision extracted data:`, extractedData);
        return {
          ...extractedData,
          scrapedAt: new Date().toISOString(),
          extractionMethod: 'ai_vision'
        };
      }

      return null;
    } catch (error) {
      console.error('AI vision extraction error:', error);
      return null;
    }
  }

  async extractTokenData() {
    try {
      const data = await this.page.evaluate(() => {
        // Helper function to extract text content
        const getText = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : null;
        };

        // Helper function to extract number from text
        const getNumber = (text) => {
          if (!text) return null;
          const match = text.match(/[\d,]+\.?\d*/);
          return match ? parseFloat(match[0].replace(/,/g, '')) : null;
        };

        // Extract basic token info
        const tokenName = getText('h1[data-testid="token-name"]') || 
                         getText('.token-name') || 
                         getText('h1');
        
        const tokenSymbol = getText('[data-testid="token-symbol"]') || 
                           getText('.token-symbol');

        // Extract price data
        const price = getText('[data-testid="token-price"]') || 
                     getText('.price') ||
                     getText('[class*="price"]');

        // Extract market cap
        const marketCap = getText('[data-testid="market-cap"]') || 
                         getText('.market-cap') ||
                         getText('[class*="market-cap"]');

        // Extract liquidity
        const liquidity = getText('[data-testid="liquidity"]') || 
                         getText('.liquidity') ||
                         getText('[class*="liquidity"]');

        // Extract volume
        const volume24h = getText('[data-testid="volume-24h"]') || 
                         getText('.volume-24h') ||
                         getText('[class*="volume"]');

        // Extract holders
        const holders = getText('[data-testid="holders"]') || 
                       getText('.holders') ||
                       getText('[class*="holder"]');

        // Extract transactions
        const transactions = getText('[data-testid="transactions"]') || 
                           getText('.transactions') ||
                           getText('[class*="transaction"]');

        // Try to extract DEXTools score
        const dexScore = getText('[data-testid="dex-score"]') || 
                        getText('.dex-score') ||
                        getText('[class*="score"]');

        // Extract additional metrics
        const priceChange24h = getText('[data-testid="price-change-24h"]') || 
                              getText('.price-change-24h') ||
                              getText('[class*="change"]');

        // Extract creation date/age
        const creationDate = getText('[data-testid="creation-date"]') || 
                            getText('.creation-date') ||
                            getText('[class*="created"]');

        return {
          name: tokenName,
          symbol: tokenSymbol,
          price: price,
          marketCap: marketCap,
          liquidity: liquidity,
          volume24h: volume24h,
          holders: holders,
          transactions: transactions,
          dexScore: dexScore,
          priceChange24h: priceChange24h,
          creationDate: creationDate,
          scrapedAt: new Date().toISOString()
        };
      });

      // Process and clean the data
      return this.processTokenData(data);
    } catch (error) {
      console.error('Error extracting token data:', error);
      throw error;
    }
  }

  processTokenData(rawData) {
    const getNumber = (text) => {
      if (!text) return null;
      const match = text.match(/[\d,]+\.?\d*/);
      return match ? parseFloat(match[0].replace(/,/g, '')) : null;
    };

    const getPercent = (text) => {
      if (!text) return null;
      const match = text.match(/(-?\d+\.?\d*)%/);
      return match ? parseFloat(match[1]) : null;
    };

    return {
      address: rawData.address,
      name: rawData.name,
      symbol: rawData.symbol,
      price: getNumber(rawData.price),
      marketCap: getNumber(rawData.marketCap),
      liquidity: getNumber(rawData.liquidity),
      volume24h: getNumber(rawData.volume24h),
      holders: getNumber(rawData.holders),
      transactions: getNumber(rawData.transactions),
      dexScore: getNumber(rawData.dexScore),
      priceChange24h: getPercent(rawData.priceChange24h),
      creationDate: rawData.creationDate,
      scrapedAt: rawData.scrapedAt,
      metrics: {
        liquidityToMarketCap: rawData.liquidity && rawData.marketCap ? 
          getNumber(rawData.liquidity) / getNumber(rawData.marketCap) : null,
        volumeToLiquidity: rawData.volume24h && rawData.liquidity ? 
          getNumber(rawData.volume24h) / getNumber(rawData.liquidity) : null,
        averageTransactionSize: rawData.volume24h && rawData.transactions ? 
          getNumber(rawData.volume24h) / getNumber(rawData.transactions) : null,
      }
    };
  }

  async takeScreenshot(contractAddress, filename = null) {
    if (!this.page) {
      await this.init();
    }

    try {
      const url = `https://www.dextools.io/app/en/solana/pair-explorer/${contractAddress}`;
      await this.page.goto(url, { waitUntil: 'networkidle2' });
      
      // Wait for charts to load
      await setTimeout(5000);

      // Take screenshot
      const screenshotPath = filename || `screenshots/dextools-${contractAddress}-${Date.now()}.png`;
      await this.page.screenshot({ 
        path: screenshotPath,
        fullPage: true 
      });

      console.log(`📸 Screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      console.error('Screenshot error:', error);
      throw error;
    }
  }

  async scrapeMultipleTokens(contractAddresses) {
    const results = [];
    
    for (const address of contractAddresses) {
      try {
        const tokenData = await this.scrapeTokenData(address);
        results.push({ address, data: tokenData, success: true });
      } catch (error) {
        console.error(`Failed to scrape ${address}:`, error.message);
        results.push({ address, error: error.message, success: false });
      }
      
      // Add delay between requests
      await setTimeout(2000);
    }
    
    return results;
  }

  async getTokenAnalytics(contractAddress) {
    const tokenData = await this.scrapeTokenData(contractAddress);
    
    // Calculate additional analytics
    const analytics = {
      ...tokenData,
      riskIndicators: {
        lowLiquidity: tokenData.liquidity && tokenData.liquidity < 50000,
        highConcentration: tokenData.holders && tokenData.holders < 100,
        newToken: this.isNewToken(tokenData.creationDate),
        lowVolume: tokenData.volume24h && tokenData.volume24h < 10000,
        negativeChange: tokenData.priceChange24h && tokenData.priceChange24h < -10,
      },
      qualityScore: this.calculateQualityScore(tokenData),
    };
    
    return analytics;
  }

  isNewToken(creationDate) {
    if (!creationDate) return false;
    
    const created = new Date(creationDate);
    const now = new Date();
    const hoursDiff = (now - created) / (1000 * 60 * 60);
    
    return hoursDiff < 24; // Consider new if less than 24 hours
  }

  calculateQualityScore(tokenData) {
    let score = 0;
    let maxScore = 0;
    
    // DEX Score (if available)
    if (tokenData.dexScore) {
      score += tokenData.dexScore;
      maxScore += 100;
    }
    
    // Liquidity score
    if (tokenData.liquidity) {
      if (tokenData.liquidity > 100000) score += 20;
      else if (tokenData.liquidity > 50000) score += 15;
      else if (tokenData.liquidity > 10000) score += 10;
      else score += 5;
      maxScore += 20;
    }
    
    // Volume score
    if (tokenData.volume24h) {
      if (tokenData.volume24h > 100000) score += 20;
      else if (tokenData.volume24h > 50000) score += 15;
      else if (tokenData.volume24h > 10000) score += 10;
      else score += 5;
      maxScore += 20;
    }
    
    // Holders score
    if (tokenData.holders) {
      if (tokenData.holders > 1000) score += 20;
      else if (tokenData.holders > 500) score += 15;
      else if (tokenData.holders > 100) score += 10;
      else score += 5;
      maxScore += 20;
    }
    
    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('🔄 DEXTools scraper closed');
    }
  }
}

// Usage example and helper functions
export const createDexToolsScraper = (options = {}) => {
  return new DexToolsScraper(options);
};

export const scrapeDexToolsQuick = async (contractAddress) => {
  const scraper = new DexToolsScraper();
  try {
    const data = await scraper.scrapeTokenData(contractAddress);
    return data;
  } finally {
    await scraper.close();
  }
};

export const getDexToolsAnalytics = async (contractAddress) => {
  const scraper = new DexToolsScraper();
  try {
    const analytics = await scraper.getTokenAnalytics(contractAddress);
    return analytics;
  } finally {
    await scraper.close();
  }
};