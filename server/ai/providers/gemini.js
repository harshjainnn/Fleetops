// server/ai/providers/gemini.js
const { GoogleGenAI } = require('@google/genai');
const { withRetry } = require('../utils/retry');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Translates our unified tool schema into Gemini's expected format.
 */
function formatToolsForGemini(tools) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

/**
 * Generates response using Gemini.
 * Supports tool integration.
 */
async function generateWithGemini(query, tools, previousCall = null, toolResult = null) {
  return withRetry(async () => {
    let contents = [{ role: 'user', parts: [{ text: query }] }];
    
    // If we have a tool result, we are in the second step of the conversational flow
    if (previousCall && toolResult) {
       contents.push({ role: 'model', parts: [{ functionCall: previousCall }] });
       contents.push({ role: 'user', parts: [{ functionResponse: { name: previousCall.name, response: toolResult } }] });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        tools: tools && tools.length > 0 ? [{ functionDeclarations: formatToolsForGemini(tools) }] : undefined,
        systemInstruction: "You are an AI logistics assistant. Use the provided tools to answer user queries about fleet tracking, orders, and driver status. Present tool responses in a clean, professional, structured format for the user."
      }
    });
    
    return {
      text: response.text,
      functionCalls: response.functionCalls
    };
  }, 2); // 2 retries on failure
}

module.exports = { generateWithGemini };
