import RedisService from "./classes/redis.service.js";

// get cache
export const getCache = async (keySource) => {
    const redis = new RedisService(keySource, 'CACHE');
    const data = await redis.getData();
    return data;
}

// set cache 
export const setCache = async (keySource, data, ttl = 300) => {
    const redis = new RedisService(keySource, 'CACHE');
    await redis.setShortLivedData(data, ttl, false);
}
 
// delete cache
export const deleteCache = async (keySource) => {
    const redis = new RedisService(keySource, 'CACHE');
    await redis.deleteData();
}