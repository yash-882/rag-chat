import app from "./app.js";
import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

//load enviroment variables
import dotenv from 'dotenv';
dotenv.config();

// prisma DB config (postgresql)
export const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL
    })
})

async function startServer() {

    try{
    // verify connection
    await prisma.$executeRaw`SELECT 1`

    console.log('Connected to PostgreSQL');

    const PORT = process.env.PORT || 8000;
    app.listen(PORT || 3000, () => console.log(`Listening to PORT: ${PORT}`))

    }
    catch(err){
        console.log('Error while starting the server', err);
    }
}
startServer()