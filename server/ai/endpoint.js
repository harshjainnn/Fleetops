// server/ai/endpoint.js
const { logisticsTools } = require('./mcp');
const { generateWithGemini } = require('./providers/gemini');
const { generateWithGroq } = require('./providers/groq');

// Unified tool definitions to be shared across multiple LLM providers
const toolsDefinition = [
  {
    name: 'find_closest_driver',
    description: 'Find the closest active driver to a given order ID',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string' }
      },
      required: ['orderId']
    }
  },
  {
    name: 'get_delayed_orders',
    description: 'Get a list of all delayed orders and their assigned drivers'
  },
  {
    name: 'suggest_better_route',
    description: 'Suggest a better route for a driver',
    parameters: {
      type: 'object',
      properties: {
        driverId: { type: 'string' }
      },
      required: ['driverId']
    }
  },
  {
    name: 'get_fleet_summary',
    description: 'Get a summary of the current fleet status'
  }
];

// Validate schemas for Groq/OpenAI compatibility
function validateSchemas(tools) {
  for (const tool of tools) {
    if (tool.parameters) {
      if (tool.parameters.type !== 'object') throw new Error(`Invalid type in tool ${tool.name}`);
      for (const key in tool.parameters.properties) {
        const propType = tool.parameters.properties[key].type;
        if (!['string', 'number', 'boolean', 'array', 'object'].includes(propType)) {
          throw new Error(`Invalid property type ${propType} in tool ${tool.name}`);
        }
      }
    }
  }
  console.log("[AI] MCP schemas validated");
}
validateSchemas(toolsDefinition);

function wantsTechnicalRouteDetails(query = '') {
  return /show technical route details|technical route details|show route internals|optimization internals/i.test(query);
}

function formatRouteOptimizationResponse(toolResult, includeTechnicalDetails = false) {
  if (!toolResult || typeof toolResult !== 'object') {
    return 'Route optimization completed, but structured output is unavailable.';
  }

  if (toolResult.error) {
    return toolResult.error;
  }

  if (toolResult.message && !toolResult.driverId) {
    return toolResult.message;
  }

  const driverId = toolResult.driverId || 'Unknown driver';
  const currentETA = toolResult.currentETA || 'N/A';
  const optimizedETA = toolResult.optimizedETA || 'N/A';
  const timeSaved = toolResult.timeSaved || '0 mins';
  const recommendation = toolResult.operationalRecommendation || 'Maintain current dispatch posture and reassess on the next route update.';
  const summary = toolResult.reason || `Operational optimization analysis completed for ${driverId}.`;

  let response = `${summary}

Current ETA: ${currentETA}
Optimized ETA: ${optimizedETA}
Estimated Time Saved: ${timeSaved}

Recommendation:
${recommendation}`;

  if (toolResult.note) {
    response += `\n\n${toolResult.note}`;
  }

  if (includeTechnicalDetails) {
    const route = Array.isArray(toolResult.suggestedRoute) ? toolResult.suggestedRoute : [];
    const routePreview = route.slice(0, 10);
    response += `\n\nTechnical Details:
- Scenario: ${toolResult.scenario || 'N/A'}
- Congestion Penalty: ${toolResult.congestionPenaltyMins ?? 'N/A'} mins
- Traffic Density Weight: ${toolResult.trafficDensityWeight ?? 'N/A'}
- Route Efficiency Score: ${toolResult.routeEfficiencyScore ?? 'N/A'}
- Delay Multiplier: ${toolResult.delayedMultiplier ?? 'N/A'}
- Corridor Points: ${route.length}
- Route Preview: ${JSON.stringify(routePreview)}${route.length > routePreview.length ? ' ...' : ''}`;
  }

  return response;
}

function buildRecommendationPayload(toolResult) {
  if (!toolResult || typeof toolResult !== 'object' || !toolResult.driverId) {
    return null;
  }

  if (!Array.isArray(toolResult.suggestedRoute) || toolResult.suggestedRoute.length === 0) {
    return null;
  }

  return {
    driverId: toolResult.driverId,
    recommendation: {
      scenario: toolResult.scenario,
      destinationUsed: toolResult.destinationUsed,
      suggestedRoute: toolResult.suggestedRoute,
      optimizedETA: toolResult.optimizedETA,
      timeSaved: toolResult.timeSaved
    }
  };
}

/**
 * Reusable helper to generate AI response.
 * Handles primary (Gemini) and secondary (Groq) fallback logic.
 */
async function generateAIResponse(query, previousCall = null, toolResult = null) {
  let result;
  try {
    console.log("[AI] Using Gemini");
    result = await generateWithGemini(query, toolsDefinition, previousCall, toolResult);
  } catch (error) {
    console.warn(`[AI] Gemini failed, switching to Groq: ${error.message}`);
    
    try {
      console.log("[AI] Using Groq fallback");
      result = await generateWithGroq(query, toolsDefinition, previousCall, toolResult);
    } catch (groqError) {
      console.error("[AI] Both Gemini and Groq failed:", groqError.message);
      // Hard fallback string if both providers completely crash
      throw new Error("AI services are temporarily unavailable, but backend tools are operational.");
    }
  }
  return result;
}

/**
 * Main Express Route Handler for /api/ai/query
 */
async function handleAiQuery(req, res) {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ success: false, response: 'Query is required' });
    }

    let aiResult;
    try {
       // Step 1: Query the LLM to either answer or select a tool
       aiResult = await generateAIResponse(query);
    } catch(err) {
       // Graceful fallback if both LLMs fail entirely
       return res.json({ success: true, response: err.message });
    }

    const functionCalls = aiResult.functionCalls;
    
    // Step 2: If the LLM requested a tool, execute it
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const functionName = call.name;
      const args = call.args;
      
      let toolResult;
      
      try {
        if (functionName === 'find_closest_driver') {
           toolResult = await logisticsTools.findClosestDriverLogistics(args.orderId);
        } else if (functionName === 'get_delayed_orders') {
           toolResult = await logisticsTools.getDelayedOrdersLogistics();
        } else if (functionName === 'suggest_better_route') {
           toolResult = await logisticsTools.suggestBetterRouteLogistics(args.driverId);
        } else if (functionName === 'get_fleet_summary') {
           toolResult = await logisticsTools.getFleetSummaryLogistics();
        } else {
           toolResult = { error: `Unknown tool requested: ${functionName}` };
        }
      } catch (toolErr) {
        console.error(`[MCP] Tool Execution Error for ${functionName}:`, toolErr);
        toolResult = { error: "Tool execution failed safely.", details: toolErr.message };
      }
      
      // Step 3: Validate and format tool output safely
      if (!toolResult) {
        toolResult = { message: "The tool returned an empty response." };
      } else if (Array.isArray(toolResult)) {
        toolResult = { results: toolResult };
      } else if (typeof toolResult !== 'object') {
        toolResult = { value: toolResult };
      }
      
      console.log(`[AI Tool Result] ${functionName}:`, JSON.stringify(toolResult, null, 2));

      if (functionName === 'suggest_better_route') {
        const technicalMode = wantsTechnicalRouteDetails(query);
        const conciseResponse = formatRouteOptimizationResponse(toolResult, technicalMode);
        const applyRecommendation = buildRecommendationPayload(toolResult);
        return res.json({
          success: true,
          response: conciseResponse,
          toolUsed: functionName,
          applyRecommendation
        });
      }

      // Step 4: Ask LLM to format the tool result into a human-readable response
      let finalResponse;
      try {
        finalResponse = await generateAIResponse(query, call, toolResult);
        return res.json({ success: true, response: finalResponse.text });
      } catch (err) {
        console.error("[AI] Formatting Gen Error:", err);
        return res.json({
          success: true,
          response: `I executed the tool (${functionName}) successfully, but encountered an issue formatting the output. Raw data: ${JSON.stringify(toolResult)}`
        });
      }
      
    } else {
      // Direct text response from LLM
      return res.json({ success: true, response: aiResult.text });
    }

  } catch (error) {
    console.error('AI query error:', error);
    // Absolute fallback to prevent frontend crashes
    return res.json({ success: true, response: "An unexpected error occurred processing your request." });
  }
}

module.exports = { handleAiQuery };
