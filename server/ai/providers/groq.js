// server/ai/providers/groq.js
const Groq = require('groq-sdk');

let groq;
// Initialize Groq if the key is available
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

/**
 * Translates our unified tool schema into OpenAI's function calling schema format
 * which is what Groq expects.
 */
function formatToolsForGroq(tools) {
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} } // Groq requires properties even if empty
    }
  }));
}

/**
 * Generates response using Groq as a fallback.
 * Uses a lightweight, fast model suitable for quick reliable responses.
 */
async function generateWithGroq(query, tools, previousCall = null, toolResult = null) {
  if (!groq) {
    // If we've instantiated Groq dynamically and it failed, throw to trigger absolute failure fallback
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    if (!groq) throw new Error("GROQ_API_KEY is not defined");
  }

  const messages = [
    { role: 'system', content: "You are an AI logistics assistant. Use the provided tools to answer user queries about fleet tracking, orders, and driver status. Present tool responses in a clean, professional, structured format for the user." },
    { role: 'user', content: query }
  ];

  // If a tool was executed, pass the execution history back to Groq
  if (previousCall && toolResult) {
     messages.push({
       role: 'assistant',
       tool_calls: [
         {
           id: previousCall.id || 'call_fallback_1',
           type: 'function',
           function: {
             name: previousCall.name,
             arguments: JSON.stringify(previousCall.args)
           }
         }
       ]
     });
     messages.push({
       role: 'tool',
       tool_call_id: previousCall.id || 'call_fallback_1',
       name: previousCall.name,
       content: JSON.stringify(toolResult)
     });
  }

  const payload = {
    model: 'llama-3.3-70b-versatile', // Fast, high-quality fallback model
    messages,
  };

  // Only pass tools if we aren't already formatting a tool response
  if (tools && tools.length > 0 && !toolResult) {
    payload.tools = formatToolsForGroq(tools);
    payload.tool_choice = "auto";
  }

  const response = await groq.chat.completions.create(payload);
  const choice = response.choices[0];

  // Map Groq's tool_calls back into the unified internal format
  let functionCalls = null;
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    functionCalls = choice.message.tool_calls.map(tc => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}"),
      id: tc.id // Preserve ID for multi-turn tool calling
    }));
  }

  return {
    text: choice.message.content || "",
    functionCalls
  };
}

module.exports = { generateWithGroq };
