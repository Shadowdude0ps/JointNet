const http = require('http');

// Render assigns the port via process.env.PORT. 8080 is only the local fallback.
function keepAlive() {
  const port = process.env.PORT || 8080;

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', uptime: Math.floor(process.uptime()) }));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`✅ Keep-alive server running on port ${port}`);
  });
}

module.exports = { keepAlive };
