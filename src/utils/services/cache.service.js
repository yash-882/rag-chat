import redisClient from "../../configs/redis.config.js";
import RedisService from "./classes/redis.service.js";

// get cache
export const getCache = async (keySource, isRealKey=false) => {
    if(isRealKey === true){
        return await redisClient.get(keySource)
    }

    const redis = new RedisService(keySource, 'CACHE');
    const data = await redis.getData();
    return data;
}

// set cache 
export const setCache = async (keySource, data, ttl = 300, isRealKey=false) => {
    if(isRealKey === true){
        return await redisClient.set(keySource, JSON.stringify(data), {
            expiration:{ type: 'EX', value: ttl }
        })
    }

    const redis = new RedisService(keySource, 'CACHE');
    await redis.setShortLivedData(data, ttl, false);

    // return key
    return redis.key
}
 
// delete cache
export const deleteCache = async (keySource, isRealKey=false) => {

    if(isRealKey === true){
        const redis = new RedisService(keySource, 'CACHE')
        redis.key = keySource
        await redis.deleteData();
        return;
    }

    const redis = new RedisService(keySource, 'CACHE');
    await redis.deleteData();
}