import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import fetch from 'cross-fetch';
import { Wallet } from '@project-serum/anchor';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Suppress punycode deprecation warning
process.removeAllListeners('warning');

// Required env vars
const RPC_URL            = process.env.RPC_URL;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
if (!RPC_URL || !WALLET_PRIVATE_KEY) {
  console.error('❌ Set RPC_URL and WALLET_PRIVATE_KEY in .env');
  process.exit(1);
}

// Solana setup
const connection = new Connection(RPC_URL, 'confirmed');
const wallet = new Wallet(
  Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY))
);

// Telegram helper
async function notifyTelegram(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'Markdown',
      },
      {
        timeout: 10_000,   // abort at 10 seconds on network‐level issues
      }
    );
  } catch (e) {
    console.error('Telegram error', e);
  }
}

// Tokens
const inputToken  = { mint: NATIVE_MINT.toBase58(), name: 'SOL' };
const outputToken = { mint: '5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2', name: 'TROLL' };

// Params
const TARGET_BUY_PRICE_USD   = 0.0306,
      TARGET_SELL_PRICE_USD  = 0.049126,
      STOP_LOSS_PERCENTAGE   = 20.0,       // Stop loss 40% below buy price
      SLIPPAGE_BPS           = 200,
      AMOUNT_TO_TRADE        = 0.1,
      CHECK_INTERVAL         = 20_000,   // 20 seconds
      TELEGRAM_INTERVAL_MS   = 240_000,  // 240 seconds
      DECIMALS               = 9;        // Token decimals

// Sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Balance check
async function checkWalletBalance() {
  const lamports = await connection.getBalance(wallet.publicKey);
  const sol = lamports / 1e9;
  console.log(`SOL balance: ${sol}`);
  return sol >= AMOUNT_TO_TRADE;
}

// Get token balance in lamports - Enhanced with retry logic
async function getBalanceLamports() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const resp = await connection.getTokenAccountsByOwner(
        wallet.publicKey,
        { mint: new PublicKey(outputToken.mint) }
      );
      
      if (!resp.value.length) {
        console.log(`Attempt ${attempt}: No token account found, waiting...`);
        if (attempt < 5) {
          await sleep(3000); // Wait 3 seconds before retry
          continue;
        }
        return 0;
      }
      
      const acct = resp.value[0].pubkey;
      const bal = await connection.getTokenAccountBalance(acct);
      const lamports = parseInt(bal.value.amount, 10);
      
      if (lamports === 0) {
        console.log(`Attempt ${attempt}: Token account exists but balance is 0, waiting...`);
        if (attempt < 5) {
          await sleep(3000);
          continue;
        }
      }
      
      console.log(`Token balance found: ${lamports / 10**DECIMALS} tokens`);
      return lamports;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt < 5) {
        await sleep(3000);
        continue;
      }
      return 0;
    }
  }
}

// Fetch token price from DexScreener
async function fetchTokenPrice(tokenMint) {
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
    );
    const pairs = response.data?.pairs || [];
    if (pairs.length === 0) {
      console.error(`No pairs found for token ${tokenMint}`);
      return null;
    }
    const price = pairs[0].priceUsd;
    if (price == null) {
      console.error(`No priceUsd on first pair for ${tokenMint}`);
      return null;
    }
    return parseFloat(price);
  } catch (error) {
    console.error(`Error fetching price for ${tokenMint}: ${error.message}`);
    return null;
  }
}

// Fetch quote (Jupiter) - Modified to handle both buy and sell
async function fetchQuote(isBuy = true, amount = null) {
  let url;
  
  if (isBuy) {
    // Buying: SOL → Token
    const amt = Math.floor(AMOUNT_TO_TRADE * 1e9);
    url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputToken.mint}` +
          `&outputMint=${outputToken.mint}` +
          `&amount=${amt}&slippageBps=${SLIPPAGE_BPS}`;
  } else {
    // Selling: Token → SOL
    url = `https://quote-api.jup.ag/v6/quote?inputMint=${outputToken.mint}` +
          `&outputMint=${inputToken.mint}` +
          `&amount=${amount}&slippageBps=${SLIPPAGE_BPS}` +
          `&onlyDirectRoutes=true`;
  }
  
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { timeout: 10_000 });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      if (i === 3) throw e;
      await sleep(2_000);
    }
  }
}

// Fetch swap transaction (Jupiter)
async function fetchSwapTx(quoteResp) {
  const res = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteResp,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true
    })
  });
  if (!res.ok) throw new Error(res.status);
  return await res.json();
}

// Send VersionedTransaction - Modified to handle both buy and sell
async function sendTx(b64, uiAmount = null, isBuy = true) {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  tx.sign([wallet.payer]);
  const raw = tx.serialize();
  const sig = await connection.sendRawTransaction(raw, { skipPreflight: true });
  
  if (isBuy) {
    // Wait for buy transaction to confirm before proceeding
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`Buy Tx confirmed: ${sig}`);
    await notifyTelegram(`🔗 Buy Tx confirmed: ${sig}`);
  } else {
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`Sold ${uiAmount} Token — Tx: ${sig}`);
    await notifyTelegram(`💸 Sold ${uiAmount} Token — Tx: ${sig}`);
  }
}

// Buy loop
async function monitorBuy() {
  const hasBalance = await checkWalletBalance();
  if (!hasBalance) { 
    console.warn('⚠️ Low balance - will fail on swap attempt, but continuing to monitor prices'); 
  }
  console.log(`Watching buy ≤ $${TARGET_BUY_PRICE_USD}`);
  while (true) {
    const price = await fetchTokenPrice(outputToken.mint);
    if (price == null) { 
      await sleep(CHECK_INTERVAL); 
      continue; 
    }
    const stopLossPrice = TARGET_BUY_PRICE_USD * (1 - STOP_LOSS_PERCENTAGE / 100);
    console.log(`Current: $${price.toFixed(6)} | Buy: $${TARGET_BUY_PRICE_USD} | Sell: $${TARGET_SELL_PRICE_USD} | Stop Loss: $${stopLossPrice.toFixed(6)}`);
    if (price <= TARGET_BUY_PRICE_USD) {
      // Check balance again right before swap attempt
      if (!await checkWalletBalance()) {
        console.error('❌ Cannot execute buy - insufficient SOL balance');
        await notifyTelegram(`❌ Buy failed - insufficient balance for $${price.toFixed(6)}`);
        await sleep(CHECK_INTERVAL);
        continue; // Continue monitoring instead of exiting
      }
      
      await notifyTelegram(`🛒 Buying at $${price.toFixed(6)}`);
      const quote = await fetchQuote(true); // true = buying
      const swapData = await fetchSwapTx(quote);
      await sendTx(swapData.swapTransaction, null, true); // true = buying
      return monitorSell(price);
    }
    await sleep(CHECK_INTERVAL);
  }
}

// Sell loop - FIXED VERSION with delay after buy
async function monitorSell(buyPrice) {
  const STOP_LOSS_PRICE_USD = buyPrice * (1 - STOP_LOSS_PERCENTAGE / 100);
  console.log(`Watching sell ≥ ${TARGET_SELL_PRICE_USD} or stop-loss ≤ ${STOP_LOSS_PRICE_USD}`);
  // ...existing code...
  
  // Wait a bit for the buy transaction to settle and token account to be created
  console.log('Waiting for buy transaction to settle...');
  await sleep(10000); // Wait 10 seconds after buy
  
  while (true) {
    const price = await fetchTokenPrice(outputToken.mint);
    if (price == null) { 
      await sleep(CHECK_INTERVAL); 
      continue; 
    }
    console.log(`Current: $${price.toFixed(6)} | Buy: $${buyPrice.toFixed(6)} | Sell: $${TARGET_SELL_PRICE_USD} | Stop Loss: $${STOP_LOSS_PRICE_USD.toFixed(6)}`);
    if (price >= TARGET_SELL_PRICE_USD || price <= STOP_LOSS_PRICE_USD) {
      const reason = price >= TARGET_SELL_PRICE_USD ? 'sell target' : 'stop-loss';
      
      // GET ACTUAL TOKEN BALANCE with retry logic
      const lamports = await getBalanceLamports();
      if (!lamports) { 
        console.error('No Token balance after retries - may need to check manually'); 
        return; 
      }
      const uiAmount = lamports / 10**DECIMALS;
      
      await notifyTelegram(`🔔 Selling ${uiAmount} Token (${reason}) @ ${price.toFixed(6)}`);
      
      // FETCH QUOTE FOR SELLING (Token → SOL)
      const quote = await fetchQuote(false, lamports); // false = selling, lamports = amount
      const swapData = await fetchSwapTx(quote);
      await sendTx(swapData.swapTransaction, uiAmount, false); // false = selling
      return;
    }
    await sleep(CHECK_INTERVAL);
  }
}

// Bootstrap
(async () => {
  console.log('🚀 Bot start');
  await notifyTelegram('🚀 Bot started');
  setInterval(async () => {
    const p = await fetchTokenPrice(outputToken.mint);
    if (p != null) await notifyTelegram(`📈 Price (Dex): $${p.toFixed(6)}`);
  }, TELEGRAM_INTERVAL_MS);
  monitorBuy().catch(e => {
    console.error(e);
    notifyTelegram(`❌ ${e.message || e}`);
  });
})();