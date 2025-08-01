"""
Simple, stable price feed for Streamlit integration
No threading, no subprocess calls, pure Python requests
"""

import requests
import time
from datetime import datetime
from typing import Dict, Optional, List

class SimplePriceFeed:
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = 10
        
        # API endpoints
        self.dexscreener_url = "https://api.dexscreener.com/latest/dex/tokens"
        self.jupiter_price_url = "https://price.jup.ag/v4/price"
        
        # SOL token mint for price conversion
        self.sol_mint = "So11111111111111111111111111111111111111112"
        
    def get_token_price(self, address: str) -> Optional[Dict]:
        """
        Get token price from multiple sources with fallback
        Handles both token addresses and pair addresses (from DEXTools URLs)
        Returns price data or None if all sources fail
        """
        # First try as pair address (DEXTools URLs typically contain pair addresses)
        try:
            price_data = self._get_dexscreener_pair_price(address)
            if price_data:
                price_data['source'] = 'DexScreener Pair'
                return price_data
        except Exception as e:
            print(f"DexScreener pair API failed: {e}")
        
        # Fallback to token API (for direct token mint addresses)
        try:
            price_data = self._get_dexscreener_price(address)
            if price_data:
                price_data['source'] = 'DexScreener Token'
                return price_data
        except Exception as e:
            print(f"DexScreener token API failed: {e}")
        
        # Fallback to Jupiter Price API (disabled for now due to DNS issues)
        # try:
        #     price_data = self._get_jupiter_price(address)
        #     if price_data:
        #         price_data['source'] = 'Jupiter'
        #         return price_data
        # except Exception as e:
        #     print(f"Jupiter failed: {e}")
        
        return None
    
    def _get_dexscreener_price(self, token_address: str) -> Optional[Dict]:
        """Get price from DexScreener token API - matches limitorder-jupitor.js implementation"""
        url = f"{self.dexscreener_url}/{token_address}"
        
        response = self.session.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        pairs = data.get('pairs', [])
        if len(pairs) == 0:
            print(f"No pairs found for token {token_address}")
            return None
            
        pair = pairs[0]  # Use first (most liquid) pair
        
        if not pair.get('priceUsd'):
            return None
        
        # Get SOL price for conversion
        sol_price_usd = self._get_sol_price()
        
        price_usd = float(pair['priceUsd'])
        price_sol = price_usd / sol_price_usd if sol_price_usd > 0 else 0
        
        return {
            'priceUsd': price_usd,
            'priceSol': price_sol,
            'change24h': float(pair.get('priceChange', {}).get('h24', 0)),
            'volume24h': float(pair.get('volume', {}).get('h24', 0)),
            'liquidity': float(pair.get('liquidity', {}).get('usd', 0)),
            'marketCap': float(pair.get('marketCap', 0)),
            'dexId': pair.get('dexId', 'unknown'),
            'pairAddress': pair.get('pairAddress', ''),
            'timestamp': time.time()
        }
    
    def _get_dexscreener_pair_price(self, pair_address: str) -> Optional[Dict]:
        """Get price from DexScreener pair API using official endpoint"""
        url = f"https://api.dexscreener.com/latest/dex/pairs/solana/{pair_address}"
        
        response = self.session.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Official API returns both 'pairs' array and 'pair' object
        pairs = data.get('pairs', [])
        if len(pairs) == 0:
            print(f"No pairs found for pair address {pair_address}")
            return None
            
        pair = pairs[0]  # Use first pair
        
        if not pair.get('priceUsd'):
            print(f"No priceUsd found in pair data")
            return None
        
        # Get SOL price for conversion
        sol_price_usd = self._get_sol_price()
        
        price_usd = float(pair['priceUsd'])
        price_sol = price_usd / sol_price_usd if sol_price_usd > 0 else 0
        
        return {
            'priceUsd': price_usd,
            'priceSol': price_sol,
            'change24h': float(pair.get('priceChange', {}).get('h24', 0)),
            'volume24h': float(pair.get('volume', {}).get('h24', 0)),
            'liquidity': float(pair.get('liquidity', {}).get('usd', 0)),
            'marketCap': float(pair.get('marketCap', 0)),
            'dexId': pair.get('dexId', 'unknown'),
            'pairAddress': pair.get('pairAddress', ''),
            'timestamp': time.time()
        }
    
    def _get_jupiter_price(self, token_address: str) -> Optional[Dict]:
        """Get price from Jupiter Price API as fallback"""
        url = f"{self.jupiter_price_url}?ids={token_address}"
        
        response = self.session.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if not data.get('data') or token_address not in data['data']:
            return None
        
        token_data = data['data'][token_address]
        price_usd = float(token_data['price'])
        
        # Get SOL price for conversion
        sol_price_usd = self._get_sol_price()
        price_sol = price_usd / sol_price_usd if sol_price_usd > 0 else 0
        
        return {
            'priceUsd': price_usd,
            'priceSol': price_sol,
            'change24h': 0,  # Not available from Jupiter API
            'volume24h': 0,
            'liquidity': 0,
            'marketCap': 0,
            'dexId': 'jupiter',
            'pairAddress': '',
            'timestamp': time.time()
        }
    
    def _get_sol_price(self) -> float:
        """Get SOL price in USD for conversion"""
        try:
            url = f"{self.jupiter_price_url}?ids={self.sol_mint}"
            response = self.session.get(url, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            if data.get('data') and self.sol_mint in data['data']:
                return float(data['data'][self.sol_mint]['price'])
        except:
            pass
        
        # Fallback SOL price if API fails
        return 200.0
    
    def get_price_with_change(self, token_address: str, previous_price: Optional[float] = None) -> Optional[Dict]:
        """
        Get current price and calculate change from previous price
        """
        current_data = self.get_token_price(token_address)
        if not current_data:
            return None
        
        # Calculate change from previous price if provided
        if previous_price is not None and previous_price > 0:
            price_change = current_data['priceUsd'] - previous_price
            price_change_percent = (price_change / previous_price) * 100
            
            current_data['priceChange'] = price_change
            current_data['priceChangePercent'] = price_change_percent
            current_data['changeDirection'] = 'up' if price_change > 0 else 'down' if price_change < 0 else 'neutral'
        else:
            current_data['priceChange'] = 0
            current_data['priceChangePercent'] = 0
            current_data['changeDirection'] = 'neutral'
        
        return current_data

# Global instance for use in Streamlit
price_feed = SimplePriceFeed()

def get_live_price(token_address: str, previous_price: Optional[float] = None) -> Optional[Dict]:
    """
    Simple function to get live price data
    """
    return price_feed.get_price_with_change(token_address, previous_price)

def test_price_feed():
    """Test function to verify price feed works"""
    # Test with AURA token
    aura_address = "4K2Mimc5gbAbNYc17em6YNtbEfKN6KaXL4G74MDPjups"
    
    print("Testing price feed...")
    price_data = get_live_price(aura_address)
    
    if price_data:
        print(f"✅ Price feed working!")
        print(f"Price USD: ${price_data['priceUsd']:.6f}")
        print(f"Price SOL: {price_data['priceSol']:.8f} SOL")
        print(f"Source: {price_data['source']}")
        print(f"24h Change: {price_data['change24h']:.2f}%")
    else:
        print("❌ Price feed failed")

if __name__ == "__main__":
    test_price_feed()