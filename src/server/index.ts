/**
 * Express server main entry point
 * Serves both API and frontend
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import apiRoutes from './routes/api';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// Serve static frontend files in production
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// Handle SPA routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't handle API routes here
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.sendFile(path.join(clientPath, 'index.html'), (err) => {
    if (err) {
      res.status(500).send('Error loading page');
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Visual Gherkin server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
