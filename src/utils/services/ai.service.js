import googleGenAI from "../../configs/googleGenAi.config.js";

export const getEmbeddings = async (textArr) => {
    const response = await googleGenAI.models.embedContent({
        model: 'gemini-embedding-001',
        contents: textArr,
    });

    return response.embeddings;
}
