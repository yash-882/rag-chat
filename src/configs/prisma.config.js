import { PrismaClient } from '../../prisma/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

// prisma DB config (postgresql)
const prismaClient = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL
    })
})

export default prismaClient