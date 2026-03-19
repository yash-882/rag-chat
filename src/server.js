//load enviroment variables
import "../loadEnvVars.js";

import app from "./app.js";
import { PrismaClient } from '../prisma/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

// prisma DB config (postgresql)
export const prismaClient = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL
    })
})

async function startServer() {

    try{
    // verify connection
    await prismaClient.$executeRaw`SELECT 1`

    console.log('Connected to PostgreSQL');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Listening to PORT: ${PORT}`))

    }
    catch(err){
        console.log('Error while starting the server', err);
    }
}

startServer()