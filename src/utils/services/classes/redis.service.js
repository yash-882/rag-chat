import { createHash } from 'crypto'
import redisClient from '../../../configs/redis.config.js';


// Redis operations
class RedisService {
    constructor(uniqueID, purpose){
    //to set purpose and uniqueKey 
    // (a unique key is generated with the combination of 'purpose' and 'uniqueID')
        this.purposes = {
            CACHE: 'cached',
            SIGN_UP_OTP: 'sign-up-otp',
            FORGOT_PASSWORD_OTP: 'forgot-password-otp'
        }
        this.uniqueID = uniqueID;
        this.purpose = this.purposes[purpose] || 'unknown'
        this.key = this.getKey();
    }
    
    getKey(){
        return `${this.purpose}:${this.uniqueID}`
    }

    // stores data with expiration time in Redis
    async setShortLivedData(data, ttl, isUpdate=false){
    const isObject = data !== null && typeof data === 'object' 

    if(isObject){
        data = JSON.stringify(data)
    }

    // XX (only set if already exists), NX (only set if doesn't exist)
    const condition = isUpdate ? 'XX' : 'NX'
    
    // temporarily (ttl example: 300 -> 5 minutes) store data in Redis
    await redisClient.set(this.key, data, {
        condition, 
        expiration:{ type: 'EX', value: ttl }
    })
}

    // store data in Redis
    async setData(data, isUpdate=false){
        const isObject = data !== null && typeof data === 'object'

    if(isObject){
        data = JSON.stringify(data)
    }

    // XX (only set if already exists), NX (only set if doesn't exist)
    const condition = isUpdate ? 'XX' : 'NX'

    //  store data in Redis
    await redisClient.set(this.key, data, {condition})
    }

    isJSON(data){
        try{
        const parsed = JSON.parse(data)

        // parsed can be null, boolean and number which JSON can parse without any error
        // return true if parsed is an object
        return typeof parsed === 'object'
       
        } catch(err){
            // not a JSON data
            return false
        }
    } 
    

    // get data by key
    async getData(){
        const data = await redisClient.get(this.key);

        if(this.isJSON(data)){
            return JSON.parse(data)
        }

        return data
    }

    // delete data by key
    async deleteData(){
        return await redisClient.del(this.key)
    }
}

export default RedisService;