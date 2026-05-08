# AI-Powered Fleet & Delivery Tracking System

An advanced logistics control center dashboard simulating a real-world fleet management system with real-time tracking, live driver simulation, and an integrated AI Assistant powered by MCP (Model Context Protocol).

## Features

- **Live Map Tracking:** Real-time visualization of drivers moving on a dark-themed map using React Leaflet.
- **Real-Time WebSockets:** Live updates for driver locations, statuses, and order changes via Socket.IO.
- **Order Management System:** Track orders from 'Pending' to 'Delivered' with status filtering and live updates.
- **Analytics Dashboard:** Recharts-powered dashboard showing fleet KPIs, delivery volume trends, and status distributions.
- **AI Query System (MCP Server):** A Gemini-powered AI Assistant capable of invoking MCP tools to answer operational questions (e.g., "Find the closest driver", "Get delayed orders").
- **Dynamic Simulation:** Backend simulation loop simulating moving drivers across New Delhi, Mumbai, and Bangalore.
- **Modern UI/UX:** Built with Tailwind CSS v4, featuring a premium dark-mode, glassmorphism aesthetics, and responsive design.

## Tech Stack

- **Frontend:** React.js, Vite, Tailwind CSS v4, React Router DOM, React Leaflet, Recharts, Socket.IO Client.
- **Backend:** Node.js, Express.js, Socket.IO, @modelcontextprotocol/sdk.
- **Database:** MongoDB (via mongoose and mongodb-memory-server for instant local development).
- **AI Integration:** Google Gemini API (`@google/genai`).

## Architecture & MCP Implementation

The system is built as a monorepo containing `client` and `server`.
The backend features an **MCP (Model Context Protocol) Server** setup. The MCP exposes critical business logic as tools (`find_closest_driver`, `get_delayed_orders`, `optimize_route`, `get_fleet_summary`).
The `/api/ai/query` endpoint acts as an AI orchestrator. It receives user queries, prompts the Gemini model with available tools, directly invokes the MCP handler functions if Gemini requests a tool, and returns the LLM's formatted response to the React frontend.

## Installation Steps

### Prerequisites
- Node.js (v18+)

### 1. Setup Backend
```bash
cd fleet-tracker/server
npm install
```

Create a `.env` file in the `server` directory:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fleet_tracker # Or use memory server out of the box by leaving it empty or localhost
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the backend:
```bash
npm start
# or for development
npm run dev
```

### 2. Setup Frontend
```bash
cd fleet-tracker/client
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

## API Documentation

- `GET /api/drivers` - Fetch all drivers
- `GET /api/drivers/:id` - Fetch single driver
- `GET /api/orders` - Fetch all orders
- `POST /api/orders` - Create an order
- `PATCH /api/orders/:id/status` - Update order status
- `GET /api/analytics/summary` - Get fleet KPIs
- `POST /api/ai/query` - Interact with the AI Assistant

## Socket Events
- **Server to Client:**
  - `driver:location:update` - Emits simulated live GPS coordinates and speed.

## Challenges & Solutions
1. **Real-time Map Performance:** Rendering many Leaflet markers with frequent socket updates caused re-rendering issues. *Solution: Maintained driver state in an optimized dictionary object and used stable component keys.*
2. **MCP Integration in Monolithic Node.js:** Running an MCP server typically involves stdio separate processes. *Solution: Integrated the SDK's logic inline while adhering to the MCP schema and parameter validation, allowing seamless LLM tool calling.*
3. **Database Portability:** Requiring a local MongoDB installation can hinder quick prototyping. *Solution: Integrated `mongodb-memory-server` to spin up an in-memory database automatically on startup if a local connection fails or isn't specified.*

## Future Improvements
- Implement historical route playback on the map.
- Add real-time traffic layer simulation affecting driver speeds.
- Implement an authentication layer for Admins vs Drivers.
- Extend the MCP Server with external API integrations (e.g., Google Maps Distance Matrix API) instead of Haversine formulas.


## Deployment Links
https://fleetops-u9qd.onrender.com/map

---
*Developed as part of an Advanced AI Coding Assessment.*
