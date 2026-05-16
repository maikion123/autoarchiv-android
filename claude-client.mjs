import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const PROVIDER = process.env.CLAUDE_PROVIDER || 'anthropic';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

let client = null;

function initClient() {
  if (PROVIDER === 'anthropic') {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set in .env');
    }
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    console.log('✓ Claude Pro (Anthropic API) initialized');
  } else if (PROVIDER === 'openrouter') {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set in .env');
    }
    client = new Anthropic({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://nextkm.de',
        'X-Title': 'AutoArchiv',
      },
    });
    console.log(`✓ OpenRouter (${OPENROUTER_MODEL}) initialized`);
  } else {
    throw new Error(`Unknown CLAUDE_PROVIDER: ${PROVIDER}`);
  }
  return client;
}

export function getClient() {
  if (!client) {
    initClient();
  }
  return client;
}

export function getProvider() {
  return PROVIDER;
}

export function getModel() {
  if (PROVIDER === 'anthropic') {
    return process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
  } else if (PROVIDER === 'openrouter') {
    return OPENROUTER_MODEL;
  }
}

export async function createMessage(messages, options = {}) {
  const apiClient = getClient();
  const model = getModel();

  try {
    const response = await apiClient.messages.create({
      model,
      max_tokens: options.max_tokens || 1024,
      system: options.system || 'You are a helpful assistant.',
      messages,
      ...options,
    });

    return response;
  } catch (error) {
    console.error(`[${PROVIDER}] Error:`, error.message);
    throw error;
  }
}

export function getConfig() {
  return {
    provider: PROVIDER,
    model: getModel(),
    apiKey: PROVIDER === 'anthropic' ? ANTHROPIC_API_KEY : OPENROUTER_API_KEY,
  };
}
