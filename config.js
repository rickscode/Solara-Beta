import { Raydium, TxVersion, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

// === Wallet Setup ===
const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
if (!privateKeyBase58) throw new Error("WALLET_PRIVATE_KEY is not set in the .env");

export const owner = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

// === RPC Connection ===
export const connection = new Connection(
  process.env.RPC_URL || clusterApiUrl('mainnet-beta'),
  'confirmed'
);

// === Jupiter Quote/Swap Endpoint ===
export const METIS_JUPITER_BASE_URL = process.env.METIS_JUPITER_BASE_URL;

// === Raydium SDK Setup ===
export const txVersion = TxVersion.V0;
const cluster = 'mainnet';

let raydium;

export const initSdk = async (params = { loadToken: false }) => {
  if (raydium) return raydium;

  if (connection.rpcEndpoint === clusterApiUrl('mainnet-beta')) {
    console.warn('⚠️ Using free RPC, consider upgrading for stability.');
  }

  console.log(`🔌 Connecting to ${connection.rpcEndpoint} (${cluster})`);

  raydium = await Raydium.load({
    owner,
    connection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params.loadToken,
    blockhashCommitment: 'finalized',
  });

  return raydium;
};

// === Token Account Fetcher (used by both bots) ===
export const fetchTokenAccountData = async () => {
  const solAccountResp = await connection.getAccountInfo(owner.publicKey);
  const tokenAccountResp = await connection.getTokenAccountsByOwner(owner.publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });
  const token2022Resp = await connection.getTokenAccountsByOwner(owner.publicKey, {
    programId: TOKEN_2022_PROGRAM_ID,
  });

  return parseTokenAccountResp({
    owner: owner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Resp.value],
    },
  });
};

// === Optional gRPC for advanced features (not used currently) ===
export const grpcUrl = process.env.GRPC_URL || '';
export const grpcToken = process.env.GRPC_TOKEN || '';

// === AI Configuration ===
import Groq from 'groq-sdk';
import axios from 'axios';

// Initialize Groq client
export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Cloudflare AI configuration
export const cloudflareAI = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  baseURL: 'https://api.cloudflare.com/client/v4',
};

// AI Model Configuration - Specialized models for different tasks
export const AI_MODELS = {
  // Groq Models
  REASONING: 'deepseek-r1-distill-llama-70b',                     // DeepSeek for mathematical reasoning and risk analysis
  MATH_ANALYSIS: 'qwen/qwen3-32b',                               // QwQ for quantitative reasoning  
  MULTIMODAL: 'meta-llama/llama-4-maverick-17b-128e-instruct',   // Maverick for multimodal analysis
  SCOUT: 'meta-llama/llama-4-scout-17b-16e-instruct',           // Scout for specialized analysis
  INSIGHTS_SUMMARY: 'llama-3.3-70b-versatile',                   // Versatile for final insights and summaries
  
  // Cloudflare Models
  VISION: 'meta-llama/llama-4-maverick-17b-128e-instruct',      // Maverick for image analysis via Groq
  SENTIMENT: '@cf/huggingface/distilbert-sst-2-int8',     // Sentiment analysis
  CODING: '@cf/qwen/qwen2.5-coder-32b-instruct',          // Code analysis
  RERANKER: '@cf/baai/bge-reranker-base',                 // Text reranking
  SAFETY: '@cf/meta/llama-guard-3-8b',                    // Content safety
  FAST_TEXT: '@cf/meta/llama-3.1-8b-instruct-fast',      // Fast text processing
};

// AI Agent Configuration
export const AI_CONFIG = {
  temperature: 0.1,
  maxTokens: 8192,
  profitThreshold: 0.2,        // Minimum 20% profit probability
  riskThreshold: 0.3,          // Maximum 30% risk score
  confidenceThreshold: 0.7,    // Minimum confidence for recommendations
};

// Telegram Configuration
export const TELEGRAM_CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
};


// Trading Configuration
export const TRADING_CONFIG = {
  maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE) || 1000,
  maxPortfolioRisk: parseFloat(process.env.MAX_PORTFOLIO_RISK) || 0.02,
  minProfitProbability: parseFloat(process.env.MIN_PROFIT_PROBABILITY) || 0.2,
  stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 0.15,
  takeProfitLevels: [0.25, 0.5, 0.75], // 25%, 50%, 75% profit levels
};

// Cloudflare AI Helper Function
export const runCloudflareAI = async (modelName, input) => {
  try {
    const response = await axios.post(
      `${cloudflareAI.baseURL}/accounts/${cloudflareAI.accountId}/ai/run/${modelName}`,
      input,
      {
        headers: {
          'Authorization': `Bearer ${cloudflareAI.apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.result;
  } catch (error) {
    console.error(`Cloudflare AI Error (${modelName}):`, error.response?.data || error.message);
    throw error;
  }
};
