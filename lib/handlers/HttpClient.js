// lib/handlers/HttpClient.js
const https = require('https');
const http = require('http');

class HttpClient {
  constructor(config) {
    this.config = config;
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  async sendError(riviumTraceError) {
    if (!this.config.isEnabled()) {
      return { success: false, reason: 'disabled' };
    }

    const payload = JSON.stringify(riviumTraceError.toJSON());
    const url = this.config.getEndpoint();

    return this._sendWithRetry(url, payload);
  }

  async _sendWithRetry(url, payload, attempt = 1) {
    try {
      const result = await this._makeRequest(url, payload);

      if (this.config.debug) {
        console.log(`[RiviumTrace] Error sent successfully (${result.statusCode})`);
      }

      return { success: true, statusCode: result.statusCode };

    } catch (error) {
      if (attempt < this.retryAttempts && this._shouldRetry(error)) {
        if (this.config.debug) {
          console.log(`[RiviumTrace] Attempt ${attempt} failed, retrying in ${this.retryDelay}ms...`);
        }

        await this._delay(this.retryDelay * attempt);
        return this._sendWithRetry(url, payload, attempt + 1);
      }

      if (this.config.debug) {
        console.log(`[RiviumTrace] Failed to send error after ${attempt} attempts:`, error.message);
      }

      return { success: false, error: error.message };
    }
  }

  _makeRequest(url, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': this.config.apiKey,
          'x-server-secret': this.config.serverSecret,
          'User-Agent': this._getUserAgent()
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: responseData });
          } else if (res.statusCode === 409) {
            // Duplicate error - this is expected and OK
            resolve({ statusCode: res.statusCode, data: responseData });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(payload);
      req.end();
    });
  }

  _shouldRetry(error) {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error.message.includes('timeout')) return true;
    if (error.message.includes('ECONNREFUSED')) return true;
    if (error.message.includes('ENOTFOUND')) return true;
    if (error.message.startsWith('HTTP 5')) return true;

    return false;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _getUserAgent() {
    const os = require('os');
    const { SDK_VERSION } = require('../config/RiviumTraceConfig');
    return `RiviumTrace-SDK/${SDK_VERSION} (nodejs; ${os.platform()}; Node.js ${process.version})`;
  }
}

module.exports = HttpClient;
