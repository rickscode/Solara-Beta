# Solara (Beta) - AI-Powered Anti-Rug Trading Bot

**🛡️ Stop Getting Rugged & Scammed!** Solara uses powerful AI models to audit tokens in real-time, protecting you from rugpulls and scam projects while maximizing your Solana trading profits.

## 🛡️ Anti-Rug Protection Features

- **🤖 AI Token Auditing**: Advanced AI models analyze token contracts, liquidity locks, and holder distribution
- **📊 Real-time Risk Assessment**: Instant security scoring to identify potential rugpulls before you trade  
- **🔍 Smart Contract Analysis**: Deep contract inspection to detect malicious code patterns
- **💎 Liquidity Lock Detection**: Verify if LP tokens are locked to prevent sudden liquidity removal
- **📈 Holder Distribution Analysis**: Identify whale concentration and suspicious wallet patterns
- **⚡ Live Market Monitoring**: Continuous surveillance for unusual trading patterns and red flags

## 🚀 Core Trading Features

- **Professional Web Interface**: Modern trading dashboard with real-time charts
- **Multi-DEX Support**: Jupiter and Raydium integration with best price execution
- **Enhanced Logging**: Beautiful terminal output with phase indicators  
- **Real-time Monitoring**: Live price tracking and wallet balance updates
- **Telegram Notifications**: Get alerts for all trading activities and security warnings
- **Advanced Risk Management**: AI-powered stop-loss and profit-taking mechanisms

## 📋 Prerequisites

- **Node.js** (v16+ recommended)
- **Python 3.8+**
- **Solana Wallet** with some SOL for trading
- **API Keys**: Groq API key for AI analysis
- **Telegram Bot** (optional, for notifications)

## 🛠️ Quick Installation Guide

### 1. Clone the Repository
```bash
git clone https://github.com/rickscode/Solara-Beta.git
cd Solara-Beta
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Set Up Python Virtual Environment
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

### 4. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 5. Run the Application
```bash
python jupiter_bot_ui.py
```

### 6. Open Web Interface
Navigate to: `http://127.0.0.1:8080`

**That's it!** The web interface will guide you through the rest of the setup process.

## ⚙️ Configuration

The application features a **completely automated setup process** through the web interface:

### 1. **Wallet Configuration**
- Enter your Solana wallet private key
- Set RPC URL (defaults to mainnet)

### 2. **Trading Configuration** 
- Set token address to trade
- Configure buy/sell target prices
- Set stop-loss percentage
- Choose trade amount (minimum 0.001 SOL)

### 3. **AI Configuration**
- Add Groq API key for AI analysis
- Configure analysis parameters

### 4. **Telegram Notifications** (Optional)
- Enter Telegram bot token
- Set chat ID for notifications

**All configuration is automatically saved** - no manual file editing required!

## 🎯 How to Use

### 1. **Setup**
- Fill out the configuration forms in the web interface
- All settings are automatically saved

### 2. **Start Trading**
- Click "Start Bot" to begin automated trading
- Monitor progress in the terminal and web interface
- Receive real-time Telegram notifications

### 3. **Monitor & Control**
- View real-time price charts and market data
- Track wallet balance and P&L
- Use "Stop Bot" or "Close Position" as needed

## 📊 Interface Overview

- **📈 Professional Dashboard**: Live charts powered by Moralis/DexScreener
- **🤖 AI Analysis**: Multi-agent token analysis and recommendations  
- **📱 Terminal Output**: Enhanced logging with beautiful phase indicators
- **💰 Wallet Tracking**: Real-time SOL balance and trading metrics
- **⚙️ Easy Configuration**: All settings managed through web forms

## 🛡️ Safety Features

- **Stop-Loss Protection**: Automatic loss prevention
- **Balance Validation**: Prevents trading without sufficient funds
- **Error Handling**: Comprehensive error catching and reporting
- **Testnet Support**: Test strategies safely before mainnet

## 🌟 Open Source & Community

**This is the open source version of Solara!** We believe in protecting the community from rugpulls and scams through transparent, accessible technology.

### 🚀 Coming Soon: Pro Version
- **Advanced AI Models**: Even more sophisticated rug detection algorithms
- **Portfolio Management**: Multi-token trading and risk diversification
- **Advanced Analytics**: Detailed performance metrics and backtesting
- **Priority Support**: Direct access to our development team
- **Exclusive Features**: First access to cutting-edge trading tools

### 💝 Support the Project
- **⭐ Star this repository** if Solara helped you avoid a rugpull!
- **🔄 Share with friends** - Help protect the entire Solana community
- **🐛 Report bugs** - Help us improve the platform for everyone
- **💡 Suggest features** - What would make your trading safer?

## ⚠️ Trading Disclaimers  

- **DYOR**: Always do your own research before trading any token
- **Start Small**: Test with small amounts until you're comfortable with the platform
- **NOT FINANCIAL ADVICE**: This software is for educational and research purposes
- **YOUR RESPONSIBILITY**: You are solely responsible for your trading decisions

## 🔧 Technical Details

### Core Components
- **Flask Web Server**: `jupiter_bot_ui.py` - Main application server
- **Trading Bots**: `limitorder-jupitor.js`, `limitorder-raydium.js` - Core trading logic
- **AI Agents**: Multi-agent analysis system for token evaluation
- **Price Feeds**: Real-time price data from multiple DEX sources

### Supported DEXs
- **Jupiter**: Advanced routing and best price execution
- **Raydium**: AMM and concentrated liquidity pools

## 🐛 Troubleshooting

### Common Issues
1. **Bot won't start**: Check wallet balance and configuration
2. **No price data**: Verify token address and network connectivity  
3. **Telegram not working**: Confirm bot token and chat ID
4. **Charts not loading**: Check network connection and token validity

### Getting Help
- Check terminal output for detailed error messages
- Verify all configuration fields are properly filled
- Ensure sufficient SOL balance for trades + gas fees

## 📝 License

This project is released under the MIT License. See LICENSE file for details.

---

## 🌐 Connect & Share

**Help us build a safer Solana ecosystem!**

- **🐙 GitHub**: [https://github.com/rickscode/Solara-Beta](https://github.com/rickscode/Solara-Beta)
- **⭐ Star the repo** if this saved you from a rugpull
- **🔄 Share with friends** - Protect the entire community
- **💬 Join discussions** in GitHub Issues
- **🚀 Follow for updates** on new anti-rug features

## 📣 Spread the Word!

*"Finally found a trading bot that actually protects me from rugs! 🛡️ @solara_bot #StopTheRugs #SolanaTrading"*

---

**Built with ❤️ for the Solana community - Let's stop rugpulls together!**