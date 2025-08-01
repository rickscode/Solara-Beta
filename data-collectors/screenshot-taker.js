import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { setTimeout } from 'timers/promises';
import { promises as fs } from 'fs';
import path from 'path';

export class ScreenshotTaker {
  constructor(options = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      quality: 90,
      screenshotDir: './storage/screenshots',
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async init() {
    try {
      console.log('📸 Initializing screenshot system...');
      
      // Ensure screenshot directory exists
      await fs.mkdir(this.options.screenshotDir, { recursive: true });

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
      
      // Set user agent and viewport
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      console.log('✅ Screenshot system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize screenshot system:', error);
      throw error;
    }
  }

  async takeChartScreenshot(contractAddress, source = 'dextools') {
    if (!this.page) {
      await this.init();
    }

    try {
      console.log(`📊 Taking chart screenshot for ${contractAddress} from ${source}`);
      
      const url = this.getChartUrl(contractAddress, source);
      const filename = `${source}-${contractAddress}-${Date.now()}.png`;
      const filepath = path.join(this.options.screenshotDir, filename);

      // Navigate to the page
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      // Wait for charts to load
      await setTimeout(5000);

      // Try to remove popups or overlays
      await this.removePopups();

      // Take screenshot
      let screenshotBuffer;
      
      if (source === 'dextools') {
        screenshotBuffer = await this.takeDexToolsChart();
      } else if (source === 'tradingview') {
        screenshotBuffer = await this.takeTradingViewChart();
      } else if (source === 'jupiter') {
        screenshotBuffer = await this.takeJupiterChart();
      } else {
        screenshotBuffer = await this.page.screenshot({ fullPage: true });
      }

      // Process and save screenshot
      const processedBuffer = await this.processScreenshot(screenshotBuffer);
      await fs.writeFile(filepath, processedBuffer);

      console.log(`✅ Chart screenshot saved: ${filename}`);
      
      return {
        filename,
        filepath,
        buffer: processedBuffer,
        source,
        contractAddress,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Chart screenshot error:', error);
      throw error;
    }
  }

  getChartUrl(contractAddress, source) {
    switch (source) {
      case 'dextools':
        return `https://www.dextools.io/app/en/solana/pair-explorer/${contractAddress}`;
      case 'tradingview':
        return `https://www.tradingview.com/chart/?symbol=SOLANA%3A${contractAddress}`;
      case 'jupiter':
        return `https://jup.ag/swap/SOL-${contractAddress}`;
      case 'birdeye':
        return `https://birdeye.so/token/${contractAddress}`;
      default:
        throw new Error(`Unsupported chart source: ${source}`);
    }
  }

  async removePopups() {
    try {
      // Common popup selectors to remove
      const popupSelectors = [
        '[data-testid="modal"]',
        '.modal',
        '.popup',
        '.overlay',
        '.cookie-banner',
        '.notification',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="overlay"]'
      ];

      for (const selector of popupSelectors) {
        await this.page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => el.style.display = 'none');
        }, selector);
      }
    } catch (error) {
      // Ignore popup removal errors
    }
  }

  async takeDexToolsChart() {
    try {
      // Wait for chart container
      await this.page.waitForSelector('[data-testid="chart-container"]', { timeout: 10000 });
      
      // Take screenshot of chart area
      const chartElement = await this.page.$('[data-testid="chart-container"]');
      if (chartElement) {
        return await chartElement.screenshot();
      }
      
      // Fallback to full page
      return await this.page.screenshot({ fullPage: true });
    } catch (error) {
      console.warn('DexTools chart selector failed, using full page');
      return await this.page.screenshot({ fullPage: true });
    }
  }

  async takeTradingViewChart() {
    try {
      // Wait for TradingView chart
      await this.page.waitForSelector('[data-name="legend-source-item"]', { timeout: 10000 });
      
      // Take screenshot of chart area
      const chartElement = await this.page.$('.chart-container');
      if (chartElement) {
        return await chartElement.screenshot();
      }
      
      return await this.page.screenshot({ fullPage: true });
    } catch (error) {
      console.warn('TradingView chart selector failed, using full page');
      return await this.page.screenshot({ fullPage: true });
    }
  }

  async takeJupiterChart() {
    try {
      // Wait for Jupiter interface
      await this.page.waitForSelector('[data-testid="swap-form"]', { timeout: 10000 });
      
      // Take screenshot of main area
      const swapElement = await this.page.$('[data-testid="swap-form"]');
      if (swapElement) {
        return await swapElement.screenshot();
      }
      
      return await this.page.screenshot({ fullPage: true });
    } catch (error) {
      console.warn('Jupiter selector failed, using full page');
      return await this.page.screenshot({ fullPage: true });
    }
  }

  async processScreenshot(buffer) {
    try {
      // Process image with sharp
      const processed = await sharp(buffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: this.options.quality })
        .toBuffer();
      
      return processed;
    } catch (error) {
      console.warn('Image processing failed, using original');
      return buffer;
    }
  }

  async takeMultipleCharts(contractAddress, sources = ['dextools', 'tradingview']) {
    const screenshots = [];
    
    for (const source of sources) {
      try {
        const screenshot = await this.takeChartScreenshot(contractAddress, source);
        screenshots.push(screenshot);
        
        // Add delay between screenshots
        await setTimeout(2000);
      } catch (error) {
        console.error(`Failed to take ${source} screenshot:`, error.message);
        screenshots.push({
          source,
          error: error.message,
          success: false
        });
      }
    }
    
    return screenshots;
  }

  async takeTimeSeriesScreenshots(contractAddress, intervals = ['5m', '15m', '1h', '4h', '1d']) {
    const screenshots = [];
    
    for (const interval of intervals) {
      try {
        // Modify URL to include time interval
        const url = `https://www.dextools.io/app/en/solana/pair-explorer/${contractAddress}?t=${interval}`;
        
        await this.page.goto(url, { waitUntil: 'networkidle2' });
        await setTimeout(3000);
        
        const filename = `dextools-${contractAddress}-${interval}-${Date.now()}.png`;
        const filepath = path.join(this.options.screenshotDir, filename);
        
        const screenshotBuffer = await this.takeDexToolsChart();
        const processedBuffer = await this.processScreenshot(screenshotBuffer);
        await fs.writeFile(filepath, processedBuffer);
        
        screenshots.push({
          filename,
          filepath,
          interval,
          contractAddress,
          timestamp: new Date().toISOString()
        });
        
        await setTimeout(2000);
      } catch (error) {
        console.error(`Failed to take ${interval} screenshot:`, error.message);
      }
    }
    
    return screenshots;
  }

  async takeScreenshotFromUrl(url, contractAddress = null) {
    if (!this.page) {
      await this.init();
    }

    try {
      console.log(`📸 Taking screenshot from URL: ${url}`);
      
      // Extract contract address from URL if not provided
      if (!contractAddress) {
        const match = url.match(/pair-explorer\/([a-zA-Z0-9]+)/);
        contractAddress = match ? match[1] : 'unknown';
      }
      
      const filename = `dextools-url-${contractAddress}-${Date.now()}.png`;
      const filepath = path.join(this.options.screenshotDir, filename);

      // Navigate to the URL
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      // Wait for charts to load
      await setTimeout(5000);

      // Try to remove popups or overlays
      await this.removePopups();

      // Take screenshot - use DexTools method if it's a DexTools URL
      let screenshotBuffer;
      if (url.includes('dextools.io')) {
        screenshotBuffer = await this.takeDexToolsChart();
      } else {
        screenshotBuffer = await this.page.screenshot({ fullPage: true });
      }

      // Process and save screenshot
      const processedBuffer = await this.processScreenshot(screenshotBuffer);
      await fs.writeFile(filepath, processedBuffer);

      console.log(`✅ Screenshot from URL saved: ${filename}`);
      
      return {
        filename,
        filepath,
        buffer: processedBuffer,
        url,
        contractAddress,
        source: 'url',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Screenshot from URL error:', error);
      throw error;
    }
  }

  async captureWebpage(url, filename = null) {
    if (!this.page) {
      await this.init();
    }

    try {
      const screenshotName = filename || `webpage-${Date.now()}.png`;
      const filepath = path.join(this.options.screenshotDir, screenshotName);

      await this.page.goto(url, { waitUntil: 'networkidle2' });
      await setTimeout(3000);
      
      const screenshotBuffer = await this.page.screenshot({ fullPage: true });
      const processedBuffer = await this.processScreenshot(screenshotBuffer);
      await fs.writeFile(filepath, processedBuffer);

      return {
        filename: screenshotName,
        filepath,
        buffer: processedBuffer,
        url,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Webpage screenshot error:', error);
      throw error;
    }
  }

  async createComposite(screenshots, outputFilename = null) {
    try {
      const composite = sharp({
        create: {
          width: 1920,
          height: 1080 * screenshots.length,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      });

      const input = [];
      for (let i = 0; i < screenshots.length; i++) {
        input.push({
          input: screenshots[i].buffer || screenshots[i].filepath,
          top: i * 1080,
          left: 0
        });
      }

      const compositeBuffer = await composite.composite(input).jpeg().toBuffer();
      
      if (outputFilename) {
        const filepath = path.join(this.options.screenshotDir, outputFilename);
        await fs.writeFile(filepath, compositeBuffer);
      }

      return compositeBuffer;
    } catch (error) {
      console.error('Composite creation error:', error);
      throw error;
    }
  }

  async listScreenshots(contractAddress = null) {
    try {
      const files = await fs.readdir(this.options.screenshotDir);
      
      if (contractAddress) {
        return files.filter(file => file.includes(contractAddress));
      }
      
      return files;
    } catch (error) {
      console.error('List screenshots error:', error);
      return [];
    }
  }

  async cleanupOldScreenshots(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const files = await fs.readdir(this.options.screenshotDir);
      const now = Date.now();
      let cleaned = 0;
      
      for (const file of files) {
        const filepath = path.join(this.options.screenshotDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          cleaned++;
        }
      }
      
      console.log(`🧹 Cleaned up ${cleaned} old screenshots`);
      return cleaned;
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('📸 Screenshot system closed');
    }
  }
}

// Helper functions
export const createScreenshotTaker = (options = {}) => {
  return new ScreenshotTaker(options);
};

export const takeQuickScreenshot = async (contractAddress, source = 'dextools') => {
  const screenshotTaker = new ScreenshotTaker();
  try {
    const screenshot = await screenshotTaker.takeChartScreenshot(contractAddress, source);
    return screenshot;
  } finally {
    await screenshotTaker.close();
  }
};

export const takeMultiSourceScreenshots = async (contractAddress) => {
  const screenshotTaker = new ScreenshotTaker();
  try {
    const screenshots = await screenshotTaker.takeMultipleCharts(contractAddress);
    return screenshots;
  } finally {
    await screenshotTaker.close();
  }
};