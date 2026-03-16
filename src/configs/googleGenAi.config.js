import { GoogleGenAI } from "@google/genai";

const googleGenAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_EMBEDDING_API_KEY
});

export default googleGenAI;
