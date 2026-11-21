# HunarSathi — Fast Streaming Buyer Assistant for HunarLink

**HunarSathi** is the dedicated AI buyer assistant embedded on the HunarLink marketplace. It uses the direct **`google-genai`** SDK with persistent keep-alive connections, token-by-token **SSE streaming**, TTL FAQ caching, automatic model failover, and a hard latency cap so every response arrives smoothly in **1–4 seconds** (and always well under 30 seconds).

## Setup & Run

1. **Configure `.env`** inside `hunarsathi-chatbot/.env`:
   ```env
   GEMINI_API_KEY=your_real_google_gemini_api_key
   GEMINI_MODEL=gemini-3.1-flash-lite
   PORT=5050
   ```

2. **Create virtual environment & install lightweight dependencies**:
   ```bash
   cd hunarsathi-chatbot
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Start the HunarSathi streaming API server**:
   ```bash
   python server.py
   ```
   Or chat directly in the terminal with live streaming:
   ```bash
   python cli_chat.py
   ```
