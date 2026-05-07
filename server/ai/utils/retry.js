// server/ai/utils/retry.js

/**
 * Executes a function with retry logic.
 * Primarily designed for AI API calls to handle temporary failures
 * like 503 Unavailable, rate limits, or timeouts.
 * 
 * Why this improves reliability:
 * LLM endpoints often face transient network blips or high load.
 * Instantly failing the user request is a poor experience. 
 * A short retry loop catches these transient errors invisibly.
 */
async function withRetry(fn, maxRetries = 2) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      const errorMessage = error.message ? error.message.toLowerCase() : "";
      
      // Determine if the error is a transient failure that we should retry
      const isRetryable = 
        error.status === 503 || 
        error.status === 429 || // rate limit
        errorMessage.includes('timeout') || 
        errorMessage.includes('unavailable') ||
        errorMessage.includes('rate limit');
        
      if (attempt > maxRetries || !isRetryable) {
        throw error;
      }
      
      console.warn(`[AI] Request failed with: ${error.message}, retrying... (${attempt}/${maxRetries})`);
      
      // Add a small delay before retrying (exponential backoff could be used here)
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
}

module.exports = { withRetry };
