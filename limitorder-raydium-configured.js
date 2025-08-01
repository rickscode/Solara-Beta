import { Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import axios from 'axios';
import { connection, owner, fetchTokenAccountData, TELEGRAM_CONFIG } from './config.js';
import { API_URLS } from '@raydium-io/raydium-sdk-v2';

// Telegram configuration
const TELEGRAM_BOT_TOKEN = TELEGRAM_CONFIG.botToken;
const TELEGRAM_CHAT_ID = TELEGRAM_CONFIG.chatId;

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
const outputToken = { mint: 'nWPwMoa1hodu3QJ3gY6btcy3zG4AtV24CV67YtYbonk', name: 'Imagine' };

// Params
const TARGET_BUY_PRICE_USD   = 7.0,
      TARGET_SELL_PRICE_USD  = 8.0,
      STOP_LOSS_PERCENTAGE   = 20.0,       // Stop loss 40% below buy price
      SLIPPAGE_BPS           = 200,
      AMOUNT_TO_TRADE        = 0.1,
      CHECK_INTERVAL         = 20_000,   // 20 seconds
      TELEGRAM_INTERVAL_MS   = 240_000,  // 240 seconds
      DECIMALS               = 9;        // Token decimals

// Calculate stop loss price dynamically
const TARGET_STOP_LOSS_PRICE = TARGET_BUY_PRICE_USD * (1 - STOP_LOSS_PERCENTAGE / 100);

// Fetch Token Price from DexScreener
const fetchTokenPriceFromDex = async (tokenAddress) => {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const pairs = response.data?.pairs;

    if (!pairs || pairs.length === 0) {
      console.error(`No pairs found for token: ${tokenAddress}`);
      return null;
    }

    const validPair = pairs.find((pair) => pair.chainId === 'solana' && pair.dexId === 'raydium');
    if (!validPair) {
      console.error(`No valid pair found for token: ${tokenAddress}`);
      return null;
    }

    const priceUsd = parseFloat(validPair.priceUsd);
    if (!priceUsd || priceUsd <= 0) {
      console.error(`Invalid USD price for token: ${tokenAddress}`);
      return null;
    }

    console.log(`Current price for token ${tokenAddress} from DexScreener: $${priceUsd.toFixed(6)}`);
    return priceUsd;
  } catch (error) {
    console.error(`Error fetching price for token ${tokenAddress} from DexScreener: ${error.message}`);
    return null;
  }
};

// Balance check
const checkWalletBalance = async () => {
  try {
    const lamports = await connection.getBalance(owner.publicKey);
    const sol = lamports / 1e9;
    console.log(`SOL balance: ${sol}`);
    return sol >= AMOUNT_TO_TRADE;
  } catch (error) {
    console.error('Error checking wallet balance:', error.message);
    return false;
  }
};

// Fetch SOL Price
const fetchSOLPrice = async () => {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    return response.data.solana.usd;
  } catch (error) {
    console.error('Error fetching SOL price:', error.message);
    return null;
  }
};

// Fetch Swap Quote (Buy)
const fetchSwapQuote = async (outputMint) => {
  try {
    const solPrice = await fetchSOLPrice();
    const solAmount = AMOUNT_TO_TRADE; // Use configurable SOL amount
    const amountInLamports = Math.floor(solAmount * 1e9);
    const slippage = SLIPPAGE_BPS / 100; // Convert BPS to percentage
    const txVersion = 'V0';

    console.log(`Purchasing ${solAmount.toFixed(4)} SOL (${amountInLamports} lamports)`);

    const { data: swapResponse } = await axios.get(
      `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${NATIVE_MINT.toBase58()}&outputMint=${outputMint}&amount=${amountInLamports}&slippageBps=${
        slippage * 100
      }&txVersion=${txVersion}`
    );

    if (swapResponse.success) {
      console.log('Swap Quote Response:', JSON.stringify(swapResponse, null, 2));
      return { swapResponse, txVersion, isInputSol: true, isOutputSol: false };
    } else {
      console.error('Failed to fetch swap quote:', swapResponse.msg);
    }
  } catch (error) {
    console.error('Error fetching swap quote:', error.message);
  }
  return null;
};

// Fetch Sell Quote
const fetchSellQuote = async (inputMint, tokenBalance) => {
  const slippage = SLIPPAGE_BPS / 100; // Convert BPS to percentage
  const txVersion = 'V0';
  console.log(`Fetching sell quote for ${tokenBalance} tokens of ${inputMint} to SOL...`);
  try {
    const { data: sellResponse } = await axios.get(
      `${API_URLS.SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${NATIVE_MINT.toBase58()}&amount=${tokenBalance}&slippageBps=${
        slippage * 100
      }&txVersion=${txVersion}`
    );

    if (sellResponse.success) {
      console.log('Sell Quote Response:', JSON.stringify(sellResponse, null, 2));
      return { sellResponse, txVersion, isInputSol: false, isOutputSol: true };
    } else {
      console.error('Failed to fetch sell quote:', sellResponse.msg);
    }
  } catch (error) {
    console.error('Error fetching sell quote:', error.message);
  }
  return null;
};

// Serialize Swap Transaction
const serializeSwapTransaction = async (swapResponse, txVersion, isInputSol, isOutputSol, inputTokenAcc, outputTokenAcc) => {
  try {
    const { data: feeData } = await axios.get(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`);
    const computeUnitPriceMicroLamports = String(feeData.data.default.h);

    const { data: swapTransactions } = await axios.post(
      `${API_URLS.SWAP_HOST}/transaction/swap-base-in`,
      {
        computeUnitPriceMicroLamports,
        swapResponse,
        txVersion,
        wallet: owner.publicKey.toBase58(),
        wrapSol: isInputSol,
        unwrapSol: isOutputSol,
        inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
        outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
      }
    );

    console.log('Serialized Swap Transactions:', JSON.stringify(swapTransactions, null, 2));
    return swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
  } catch (error) {
    console.error('Error serializing transaction:', error.message);
    throw error;
  }
};

// Deserialize Transactions
const deserializeTransactions = (serializedTransactions, txVersion) => {
  try {
    const allTransactions = serializedTransactions.map((txBuf) =>
      txVersion === 'V0' ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf)
    );
    console.log(`Deserialized ${allTransactions.length} transactions:`, allTransactions);
    return allTransactions;
  } catch (error) {
    console.error('Error during deserialization:', error.message);
    throw error;
  }
};

// Sign and Execute Transactions
const signAndExecuteTransactions = async (transactions, txVersion) => {
  let idx = 0;
  const MAX_RETRIES = 5; // Set the maximum number of retries

  for (const transaction of transactions) {
    idx++;
    let txId;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Signing and sending transaction ${idx} (Attempt ${attempt})...`);
        transaction.sign([owner]); // Sign the transaction

        // Send transaction and capture the transaction ID
        txId = await connection.sendTransaction(transaction, {
          skipPreflight: true,
          preflightCommitment: 'processed', // Preflight checks with "processed" commitment
        });

        console.log(`Transaction sent, txId: ${txId}`);

        // Wait for confirmation with an extended timeout
        await connection.confirmTransaction(txId, 'confirmed', 60000); // Wait up to 60 seconds
        console.log(`Transaction ${idx} confirmed, txId: ${txId}`);

        break; // Exit the retry loop on success
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          console.error(`Transaction ${idx} failed after ${MAX_RETRIES} attempts. txId: ${txId}`);
          continue; // Move to the next transaction after retries are exhausted
        }

        console.error(`Error with transaction ${idx} on attempt ${attempt}: ${error.message}`);

        // Wait briefly before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
};

// Monitor and Buy Token
const monitorAndBuyToken = async () => {
  console.log(`Watching buy ≤ $${TARGET_BUY_PRICE_USD}`);
  
  while (true) {
    try {
      // Fetch the current price of the token
      const currentPrice = await fetchTokenPriceFromDex(outputToken.mint);
      
      if (!currentPrice) {
        console.log(`Failed to fetch current price. Retrying in ${CHECK_INTERVAL/1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
        continue;
      }

      console.log(`Current: $${currentPrice.toFixed(6)} | Buy: $${TARGET_BUY_PRICE_USD} | Sell: $${TARGET_SELL_PRICE_USD} | Stop Loss: $${TARGET_STOP_LOSS_PRICE.toFixed(6)}`);

      // Check if the target price has been reached
      if (parseFloat(currentPrice) <= TARGET_BUY_PRICE_USD) {
        console.log(`🛒 Buying at $${currentPrice.toFixed(6)}`);
        await notifyTelegram(`🛒 Buying at $${currentPrice.toFixed(6)}`);

        // Check balance before attempting trade
        const hasBalance = await checkWalletBalance();
        if (!hasBalance) {
          console.error(`❌ Insufficient balance for trade amount (${AMOUNT_TO_TRADE} SOL) - Bot stopping`);
          console.log('Bot stopped due to insufficient funds');
          return false; // Stop the bot
        }

        // Fetch swap quote
        const swapQuote = await fetchSwapQuote(outputToken.mint);
        if (!swapQuote) {
          console.error('Failed to fetch swap quote. Retrying...');
          continue;
        }

        const { swapResponse, txVersion } = swapQuote;
        const inputTokenAcc = null; // SOL doesn't have an associated token account
        const outputTokenAcc = null; // Define token account where you want to receive the tokens

        // Serialize and execute swap transaction
        const serializedSwapTransactions = await serializeSwapTransaction(
          swapResponse,
          txVersion,
          true,
          false,
          inputTokenAcc,
          outputTokenAcc
        );

        if (!serializedSwapTransactions) {
          console.error('Serialization of swap transaction failed. Retrying...');
          continue;
        }

        const deserializedSwapTransactions = deserializeTransactions(serializedSwapTransactions, txVersion);

        try {
          await signAndExecuteTransactions(deserializedSwapTransactions, txVersion);
          console.log('🔗 Buy Tx completed successfully!');
          await notifyTelegram('🔗 Buy Tx completed successfully!');
          return true; // Exit loop after successful swap
        } catch (error) {
          console.error('Error during swap transaction execution:', error.message);
          return false;
        }
      }
    } catch (error) {
      console.error('Unexpected error in monitorAndBuyToken loop:', error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL)); // Retry based on configuration
  }
};

// Monitor and Sell Token
const monitorAndSellToken = async () => {
  console.log(`Watching sell ≥ ${TARGET_SELL_PRICE_USD} or stop-loss ≤ ${TARGET_STOP_LOSS_PRICE.toFixed(6)}`);
  
  while (true) {
    try {
      // Fetch the current price of the token
      const currentPrice = await fetchTokenPriceFromDex(outputToken.mint);
      
      if (!currentPrice) {
        console.log(`Failed to fetch current price. Retrying in ${CHECK_INTERVAL/1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
        continue;
      }

      console.log(`Current: $${currentPrice.toFixed(6)} | Buy: $${TARGET_BUY_PRICE_USD} | Sell: $${TARGET_SELL_PRICE_USD} | Stop Loss: $${TARGET_STOP_LOSS_PRICE.toFixed(6)}`);

      // Check if the target price has been reached or if the stop loss price has been triggered
      if (parseFloat(currentPrice) >= TARGET_SELL_PRICE_USD || parseFloat(currentPrice) <= TARGET_STOP_LOSS_PRICE) {
        const reason = parseFloat(currentPrice) >= TARGET_SELL_PRICE_USD ? 'sell target' : 'stop-loss';

        // Fetch token accounts and validate balance
        const { tokenAccounts } = await fetchTokenAccountData();
        const tokenBalance = tokenAccounts.find((a) => a.mint.toBase58() === outputToken.mint)?.amount || 0;

        if (tokenBalance <= 0) {
          console.error('No token balance available for selling. Exiting...');
          return false;
        }

        const uiAmount = tokenBalance / 10**DECIMALS;
        console.log(`🔔 Selling ${uiAmount.toFixed(4)} Token (${reason}) @ ${currentPrice.toFixed(6)}`);
        await notifyTelegram(`🔔 Selling ${uiAmount.toFixed(4)} Token (${reason}) @ ${currentPrice.toFixed(6)}`);

        // Fetch sell quote
        const sellQuote = await fetchSellQuote(outputToken.mint, tokenBalance);
        if (!sellQuote) {
          console.error('Failed to fetch sell quote. Retrying...');
          continue;
        }

        const { sellResponse, txVersion } = sellQuote;
        const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === outputToken.mint)?.publicKey;
        const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === NATIVE_MINT.toBase58())?.publicKey;

        // Serialize and execute sell transaction
        const serializedSellTransactions = await serializeSwapTransaction(
          sellResponse,
          txVersion,
          false,
          true,
          inputTokenAcc,
          outputTokenAcc
        );

        if (!serializedSellTransactions) {
          console.error('Serialization of sell transaction failed. Retrying...');
          continue;
        }

        const deserializedSellTransactions = deserializeTransactions(serializedSellTransactions, txVersion);

        try {
          await signAndExecuteTransactions(deserializedSellTransactions, txVersion);
          console.log(`💸 Sold ${uiAmount.toFixed(4)} Token — Tx completed successfully`);
          await notifyTelegram(`💸 Sold ${uiAmount.toFixed(4)} Token — Tx completed successfully`);
          return true; // Exit loop after successful sell
        } catch (error) {
          console.error('Error during sell transaction execution:', error.message);
          return false;
        }
      }
    } catch (error) {
      console.error('Unexpected error in monitorAndSellToken loop:', error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL)); // Retry based on configuration
  }
};

// Main Function
const main = async () => {
  try {
    console.log('Starting token monitoring and trading...');
    await notifyTelegram('🚀 Raydium Bot (Configured) started');

    // Step 1: Monitor and buy token
    const hasBought = await monitorAndBuyToken();
    if (!hasBought) {
      console.error('Failed to buy token. Exiting...');
      return;
    }

    // Step 2: Monitor and sell token
    const hasSold = await monitorAndSellToken();
    if (!hasSold) {
      console.error('Failed to sell token. Exiting...');
      return;
    }

    console.log('Trading completed successfully!');
    await notifyTelegram('✅ Trading completed successfully!');
  } catch (error) {
    console.error('Unexpected error in the main function:', error.message);
    await notifyTelegram(`❌ Bot error: ${error.message}`);
  }
};

// Start periodic price updates
setInterval(async () => {
  try {
    const price = await fetchTokenPrice(outputToken.mint);
    if (price != null) {
      await notifyTelegram(`📈 ${outputToken.name} Price: $${price.toFixed(6)}`);
    }
  } catch (error) {
    console.error('Error in periodic price update:', error.message);
  }
}, TELEGRAM_INTERVAL_MS);

// Call the main function
main();