// handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.log('UNCAUGHT EXCEPTION! Shutting down...');
    console.log(err.name, err.message);
    process.exit(1);
});

//load enviroment variables
import "../loadEnvVars.js";

import app from "./app.js";
import redisClient from "./configs/redis.config.js";
import prismaClient from "./configs/prisma.config.js";


let isRedisAlive = true;
const PORT = process.env.PORT || 3000;

// listens for redis error event
redisClient.on('error', (err) => {
    console.log('Redis Client Error', err);
    
    isRedisAlive = false;
});

async function startServer() {
    
    try {
        await prismaClient.$executeRaw`SELECT 1` // verify database connection (PostgreSQL)
        console.log('Connected to PostgreSQL'); 
        
        const redisConn = await redisClient.connect(); // connect to Redis
        console.log('Connected to Redis');

        app.listen(PORT, () => console.log(`Listening to PORT: ${PORT}`));

        return { redisClient: redisConn };
    }
    catch (err) {
        console.log('Error while starting the server', err);

        // prevent app shutdown on redis errors
        const REDIS_DOWN_ERRORS = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'];
        
        if(REDIS_DOWN_ERRORS.includes(err.code)){
            isRedisAlive = false
            app.listen(PORT, () => console.log(`Listening to PORT: ${PORT} (Redis Down)`));
        }

        else {
            console.log('Shutting down the server...');
            process.exit(1); // close app
        }
    }
}
await startServer();

