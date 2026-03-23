import express from 'express';
import contentRouter from './routes/content.route.js';
import GlobalErrorHandler from './middlewares/globalErr.middleware.js';
import authRouter from './routes/auth.route.js';
import cookieParser from 'cookie-parser';

const app = express();

// cookie parser
app.use(cookieParser());

// body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// routes
app.use('/api/content', contentRouter)
app.use('/api/auth', authRouter)

// global error handler
app.use(GlobalErrorHandler)

export default app;