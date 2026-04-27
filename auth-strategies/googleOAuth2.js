import {Strategy as GoogleStrategy} from 'passport-google-oauth2';
import { randomInt } from 'crypto';
import { hash } from 'bcrypt';
import prismaClient from '../src/configs/prisma.config.js';

// google OAUTH2 strategy
export const GoogleAuthStrategy = new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_OAUTH_CALLBACK_URL,
    passReqToCallback: true,

}, 
// executes after google has successfully authorized both the user and the client(App)
async (request, accessToken, refreshToken, profile, done) => {
    try{
    let user = await prismaClient.user.findUnique({
        where: {
            email: profile.emails[0].value
        }
    })
    
    // create user if doesn't exist in DB
    if(!user){
        user = await prismaClient.user.create({
            data: {
                name: profile.displayName,
                email: profile.emails[0].value,
                password: await hash(randomInt(2814749767).toString(), 10), //random password
                auths: ['GOOGLE'] //indicates user has signed up using google OAUTH
            }
        }) 
}

// user already exists but has never signed in using google
else if(!user.auths.includes('GOOGLE')){
    //save and update auth methods of user
    user.auths.push('GOOGLE')
    user = await prismaClient.user.update({
        where: {
            id: user.id
        },
        data: {
            auths: {push: 'GOOGLE'}
        }
    })
}

  // user is now authenticated via google
    return done(null, user) //pass user for further handling
}
    catch(err){
        return done(err)
    }
})