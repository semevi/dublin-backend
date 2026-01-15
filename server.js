{
  "name": "flight-api-server",
  "version": "1.0.0",
  "description": "Flight Data API Server",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-session": "^1.18.0",
    "node-fetch": "^3.3.2"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
