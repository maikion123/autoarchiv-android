#!/usr/bin/env node
/**
 * Test script to verify Claude API connection with current provider
 * Usage: node scripts/test-claude.mjs
 */

import { getClient, getProvider, getModel, createMessage } from '../claude-client.mjs';

async function main() {
  try {
    console.log('🧪 Testing Claude API Connection\n');

    const provider = getProvider();
    const model = getModel();

    console.log(`Provider: ${provider}`);
    console.log(`Model: ${model}\n`);

    console.log('Sending test message...\n');

    const response = await createMessage(
      [
        {
          role: 'user',
          content: 'Respond with only: "Claude is working!" and nothing else.',
        },
      ],
      {
        max_tokens: 100,
      }
    );

    const content = response.content[0];
    if (content.type === 'text') {
      console.log(`✅ Response: ${content.text}`);
      console.log(`\n📊 Stats:`);
      console.log(`   Input tokens: ${response.usage.input_tokens}`);
      console.log(`   Output tokens: ${response.usage.output_tokens}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
