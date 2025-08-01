import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';
import axios from 'axios';

export class SocialScraper {
  constructor(options = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      maxPosts: 50,
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async init() {
    try {
      console.log('🐦 Initializing social media scraper...');
      
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
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      console.log('✅ Social media scraper initialized');
    } catch (error) {
      console.error('❌ Failed to initialize social scraper:', error);
      throw error;
    }
  }

  async extractSocialLinksFromDexTools(dexToolsUrl) {
    if (!this.page) {
      await this.init();
    }

    try {
      console.log(`🔍 Extracting social links from DexTools...`);
      
      await this.page.goto(dexToolsUrl, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      // Wait for page to load
      await setTimeout(3000);

      // Extract social media links
      const socialLinks = await this.page.evaluate(() => {
        const links = {
          telegram: null,
          discord: null,
          website: null
        };

        // Look for social media links in various selectors
        const socialSelectors = [
          'a[href*="t.me"]',
          'a[href*="discord."]',
          'a[href*="telegram."]'
        ];

        socialSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const href = element.href;
            if (href.includes('t.me') || href.includes('telegram.')) {
              links.telegram = href;
            } else if (href.includes('discord.')) {
              links.discord = href;
            }
          });
        });

        // Also look for website links
        const websiteSelectors = [
          'a[href*="http"]:not([href*="dextools"]):not([href*="telegram"]):not([href*="discord"])'
        ];

        websiteSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0 && !links.website) {
            const href = elements[0].href;
            if (href && href.startsWith('http') && !href.includes('dextools.io')) {
              links.website = href;
            }
          }
        });

        return links;
      });

      console.log(`📊 Found social links:`, socialLinks);
      return socialLinks;
    } catch (error) {
      console.error('Failed to extract social links:', error);
      return null;
    }
  }


  async scrapeOfficialTelegramChannel(telegramUrl) {
    if (!this.page) {
      await this.init();
    }

    try {
      console.log(`📱 Scraping official Telegram channel: ${telegramUrl}`);
      
      // Convert Telegram URL to web version
      const webUrl = telegramUrl.replace('t.me/', 't.me/s/');
      
      await this.page.goto(webUrl, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      // Wait for messages to load
      await setTimeout(5000);

      // Extract recent messages
      const messages = await this.page.evaluate(() => {
        const messageElements = document.querySelectorAll('.tgme_widget_message');
        const messages = [];

        messageElements.forEach((message, index) => {
          if (index >= 10) return; // Limit to 10 recent messages

          const textElement = message.querySelector('.tgme_widget_message_text');
          const timeElement = message.querySelector('.tgme_widget_message_date time');
          const authorElement = message.querySelector('.tgme_widget_message_author');

          if (textElement) {
            messages.push({
              id: `official_telegram_${index}`,
              content: textElement.textContent.trim(),
              author: authorElement ? authorElement.textContent.trim() : 'Official',
              timestamp: timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString(),
              isOfficial: true,
              url: window.location.href
            });
          }
        });

        return messages;
      });

      console.log(`📊 Found ${messages.length} official Telegram messages`);
      return messages;
    } catch (error) {
      console.error('Failed to scrape official Telegram:', error);
      return [];
    }
  }


  async scrapeTelegramMentions(searchQuery, contractAddress, dexToolsUrl = null) {
    try {
      console.log(`📱 Scraping Telegram mentions for ${searchQuery}`);
      
      // First, try to find official Telegram from DexTools
      let officialTelegram = null;
      if (dexToolsUrl) {
        try {
          const socialLinks = await this.extractSocialLinksFromDexTools(dexToolsUrl);
          if (socialLinks?.telegram) {
            officialTelegram = socialLinks.telegram;
            console.log(`🎯 Found official Telegram: ${officialTelegram}`);
          }
        } catch (error) {
          console.error('Failed to extract Telegram from DexTools:', error.message);
        }
      }
      
      // Search multiple Telegram crypto channels
      const channels = [
        '@solana_community',
        '@solanaalpha',
        '@solanatrading',
        '@cryptogemhunters',
        '@solanaalphagroup'
      ];

      const allPosts = [];
      
      // If we found official Telegram, scrape it first
      if (officialTelegram) {
        try {
          const officialPosts = await this.scrapeOfficialTelegramChannel(officialTelegram);
          allPosts.push(...officialPosts);
        } catch (error) {
          console.error('Failed to scrape official Telegram:', error.message);
        }
      }
      
      for (const channel of channels.slice(0, 3)) { // Limit channels
        try {
          const posts = await this.scrapeTelegramChannel(channel, searchQuery, contractAddress);
          allPosts.push(...posts);
          await setTimeout(2000);
        } catch (error) {
          console.error(`Failed to scrape channel ${channel}:`, error.message);
        }
      }

      console.log(`📊 Found ${allPosts.length} Telegram posts`);
      
      return {
        platform: 'telegram',
        query: searchQuery,
        contractAddress: contractAddress,
        posts: allPosts,
        totalFound: allPosts.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Telegram scraping error:', error);
      return {
        platform: 'telegram',
        posts: [],
        error: error.message
      };
    }
  }

  async scrapeTelegramChannel(channel, searchQuery, contractAddress) {
    if (!this.page) {
      await this.init();
    }

    try {
      const channelUrl = `https://t.me/s/${channel.replace('@', '')}`;
      
      await this.page.goto(channelUrl, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      await setTimeout(3000);

      // Extract messages
      const posts = await this.page.evaluate((query, address, maxPosts) => {
        const messageElements = document.querySelectorAll('.tgme_widget_message');
        const posts = [];
        
        for (let i = 0; i < Math.min(messageElements.length, maxPosts); i++) {
          const message = messageElements[i];
          
          try {
            const textElement = message.querySelector('.tgme_widget_message_text');
            const authorElement = message.querySelector('.tgme_widget_message_author');
            const timeElement = message.querySelector('.tgme_widget_message_date');
            const viewsElement = message.querySelector('.tgme_widget_message_views');
            
            const content = textElement ? textElement.textContent.trim() : '';
            
            // Filter for relevant content
            if (content.toLowerCase().includes(query.toLowerCase()) || 
                content.includes(address) ||
                content.toLowerCase().includes('solana') ||
                content.toLowerCase().includes('token')) {
              
              const post = {
                id: `telegram-${i}-${Date.now()}`,
                platform: 'telegram',
                content: content,
                author: authorElement ? authorElement.textContent.trim() : 'Unknown',
                timestamp: timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString(),
                views: viewsElement ? this.extractNumber(viewsElement.textContent) : 0,
                url: message.querySelector('.tgme_widget_message_date')?.href || ''
              };
              
              posts.push(post);
            }
          } catch (error) {
            console.error('Error parsing telegram message:', error);
          }
        }
        
        return posts;
      }, searchQuery, contractAddress, this.options.maxPosts);

      return posts;
    } catch (error) {
      console.error('Telegram channel scraping error:', error);
      return [];
    }
  }

  async scrapeRedditMentions(searchQuery, contractAddress) {
    try {
      console.log(`🔍 Scraping Reddit mentions for ${searchQuery}`);
      
      // Search Solana-related subreddits
      const subreddits = [
        'solana',
        'SolanaTrading',
        'soldev',
        'CryptoMoonShots',
        'cryptocurrency'
      ];

      const allPosts = [];
      
      for (const subreddit of subreddits.slice(0, 3)) { // Limit subreddits
        try {
          const posts = await this.scrapeRedditSubreddit(subreddit, searchQuery, contractAddress);
          allPosts.push(...posts);
          await setTimeout(2000);
        } catch (error) {
          console.error(`Failed to scrape r/${subreddit}:`, error.message);
        }
      }

      console.log(`📊 Found ${allPosts.length} Reddit posts`);
      
      return {
        platform: 'reddit',
        query: searchQuery,
        contractAddress: contractAddress,
        posts: allPosts,
        totalFound: allPosts.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Reddit scraping error:', error);
      return {
        platform: 'reddit',
        posts: [],
        error: error.message
      };
    }
  }

  async scrapeRedditSubreddit(subreddit, searchQuery, contractAddress) {
    if (!this.page) {
      await this.init();
    }

    try {
      const searchUrl = `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(searchQuery)}&restrict_sr=1&sort=new`;
      
      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });

      await setTimeout(3000);

      // Extract posts
      const posts = await this.page.evaluate((query, address, maxPosts) => {
        const postElements = document.querySelectorAll('[data-testid="post-container"]');
        const posts = [];
        
        for (let i = 0; i < Math.min(postElements.length, maxPosts); i++) {
          const post = postElements[i];
          
          try {
            const titleElement = post.querySelector('[data-testid="post-content"] h3');
            const authorElement = post.querySelector('[data-testid="post-content"] a[href*="/user/"]');
            const timeElement = post.querySelector('[data-testid="post-content"] time');
            const scoreElement = post.querySelector('[data-testid="post-content"] [data-testid="vote-up-button"]');
            const commentsElement = post.querySelector('[data-testid="post-content"] [data-testid="comments-button"]');
            
            const title = titleElement ? titleElement.textContent.trim() : '';
            const content = post.querySelector('[data-testid="post-content"] p')?.textContent.trim() || '';
            
            const fullContent = `${title} ${content}`;
            
            // Filter for relevant content
            if (fullContent.toLowerCase().includes(query.toLowerCase()) || 
                fullContent.includes(address) ||
                fullContent.toLowerCase().includes('solana')) {
              
              const postData = {
                id: `reddit-${i}-${Date.now()}`,
                platform: 'reddit',
                content: fullContent,
                author: authorElement ? authorElement.textContent.trim() : 'Unknown',
                timestamp: timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString(),
                score: scoreElement ? this.extractNumber(scoreElement.textContent) : 0,
                comments: commentsElement ? this.extractNumber(commentsElement.textContent) : 0,
                url: post.querySelector('a[href*="/comments/"]')?.href || ''
              };
              
              posts.push(postData);
            }
          } catch (error) {
            console.error('Error parsing reddit post:', error);
          }
        }
        
        return posts;
      }, searchQuery, contractAddress, this.options.maxPosts);

      return posts;
    } catch (error) {
      console.error('Reddit subreddit scraping error:', error);
      return [];
    }
  }

  removeDuplicatePosts(posts) {
    const seen = new Set();
    return posts.filter(post => {
      const key = `${post.platform}-${post.content.substring(0, 50)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  filterRelevantPosts(posts, searchQuery, contractAddress) {
    return posts.filter(post => {
      const content = post.content.toLowerCase();
      const query = searchQuery.toLowerCase();
      
      // Must contain search query or contract address
      if (!content.includes(query) && !content.includes(contractAddress.toLowerCase())) {
        return false;
      }
      
      // Filter out spam/low quality
      if (content.length < 10 || content.includes('🚀'.repeat(3))) {
        return false;
      }
      
      // Filter out obvious spam patterns
      const spamPatterns = [
        /(.)\1{4,}/, // Repeated characters
        /🚀{5,}/, // Too many rocket emojis
        /FREE.*CRYPTO/i,
        /CLICK.*LINK/i,
        /TELEGRAM.*BOT/i
      ];
      
      return !spamPatterns.some(pattern => pattern.test(content));
    });
  }

  async scrapeAllPlatforms(searchQuery, contractAddress, dexToolsUrl = null) {
    try {
      console.log(`🌐 Scraping all platforms for ${searchQuery}`);
      
      const [telegramData, redditData] = await Promise.allSettled([
        this.scrapeTelegramMentions(searchQuery, contractAddress, dexToolsUrl),
        this.scrapeRedditMentions(searchQuery, contractAddress)
      ]);

      const socialData = {
        query: searchQuery,
        contractAddress: contractAddress,
        platforms: {
          telegram: telegramData.status === 'fulfilled' ? telegramData.value : { posts: [], error: telegramData.reason },
          reddit: redditData.status === 'fulfilled' ? redditData.value : { posts: [], error: redditData.reason }
        },
        summary: {
          totalPosts: 0,
          platformsScraped: 0,
          errors: []
        },
        timestamp: new Date().toISOString()
      };

      // Calculate summary
      Object.keys(socialData.platforms).forEach(platform => {
        const data = socialData.platforms[platform];
        if (data.posts && data.posts.length > 0) {
          socialData.summary.totalPosts += data.posts.length;
          socialData.summary.platformsScraped++;
        }
        if (data.error) {
          socialData.summary.errors.push({ platform, error: data.error });
        }
      });

      console.log(`✅ Social scraping complete - ${socialData.summary.totalPosts} posts from ${socialData.summary.platformsScraped} platforms`);
      
      return socialData;
    } catch (error) {
      console.error('Multi-platform scraping error:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('🔄 Social scraper closed');
    }
  }
}

// Helper functions
export const createSocialScraper = (options = {}) => {
  return new SocialScraper(options);
};

export const scrapeTokenSentiment = async (searchQuery, contractAddress) => {
  const scraper = new SocialScraper();
  try {
    const socialData = await scraper.scrapeAllPlatforms(searchQuery, contractAddress);
    return socialData;
  } finally {
    await scraper.close();
  }
};

