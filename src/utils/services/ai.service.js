import googleGenAI from "../../configs/googleGenAi.config.js";
import { openai } from "../../configs/openAi.config.js";
import opError from "../classes/opError.class.js";

// generate embeddings
export const getEmbeddings = async (textArr) => {
    const response = await googleGenAI.models.embedContent({
        model: 'gemini-embedding-001',
        contents: textArr,
        config: {
            outputDimensionality: 768  // to get arr of 768 vectors[]
        }
    });

    // model fails to generate embeddings
    if(response.embeddings?.length === 0 || response.embeddings[0].values.length === 0)
        throw new opError("Couldn’t process your request. Please try again.", 502)

    return response.embeddings;
}

// generate text-based answers
export const getAnswersByAi = async ({context, question}) => {
    // GENERATE ANSWER USING LLM
    const response = await openai.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
            {
                role: "system",
                content: `
You are an assistant answering a user's question using information derived from provided context.
Context:
${context}

Rules:
- Respond naturally and directly to the user.
- Use the context as the source of truth for factual information.
- Do not introduce facts not supported by the context.
- Do not mention the context or say phrases like "based on the provided context/information".
- If the answer cannot be determined from the context, say so clearly.
- For advice or opinion questions, provide general guidance without making unsupported or specific claims.
- Be concise and clear.
`
            },
            {
                role: "user",
                content: question
                }
        ],     temperature: 0

    });

    const answer = response.choices[0].message.content;

    // openai fails to respond with a message
    if(answer.length === 0)
        throw new opError('Could not generate answer for the provided question.', 502);

    return answer;

}  