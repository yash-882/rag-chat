import express from 'express';
import contentRouter from './routes/content.route.js';
import GlobalErrorHandler from './middlewares/globalErr.middleware.js';
import authRouter from './routes/auth.route.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';

const app = express();

// cookie parser
app.use(cookieParser());

//CORS config
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
}))

// body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// routes
app.use('/api/content', contentRouter)
app.use('/api/auth', authRouter)

// health check route
app.use('/api/health-check', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is up and running.'
    })
})


// not found middleware
app.use((req, res, next) => {
    res.status(404).json({
        status: 'fail',
        message: 'Route not found.'
    })
})

// global error handler
app.use(GlobalErrorHandler)

export default app;