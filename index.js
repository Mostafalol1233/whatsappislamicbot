import { startBot } from './src/bot.js';

startBot().catch((error) => {
  console.error('Failed to start bot:', error?.message || error);
  process.exitCode = 1;
});
