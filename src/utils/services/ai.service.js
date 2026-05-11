import googleGenAI from "../../configs/googleGenAi.config.js";
import { openai } from "../../configs/openAi.config.js";
import { buildSystemPrompt } from "../../constants/system.prompt.js";
import opError from "../classes/opError.class.js";

// generate embeddings
export const getEmbeddings = async (textArr) => {

    // GoogleGenAi limits 100 chunks per request
    if (textArr.length > 100) {
        throw new opError(
            'Text is too long to process. Please try again with a smaller file.', 400);
    }

    const response = await googleGenAI.models.embedContent({
        model: 'gemini-embedding-001',
        contents: textArr,
        config: {
            outputDimensionality: 768  // to get arr of 768 vectors[]
        }
    });

    // model fails to generate embeddings
    if (response.embeddings?.length === 0 || response.embeddings[0].values.length === 0)
        throw new opError("Couldn’t process your request. Please try again.", 502)

    return response.embeddings;
}

// generate text-based answers
export const getAnswersByAi = async ({ context, question, memory }) => {
    // GENERATE ANSWER USING LLM
    const response = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || "openai/gpt-oss-20b",
        messages: [
            {
                role: "system",
                content: buildSystemPrompt(context, memory)
            },
            {
                role: "user",
                content: question
            }
        ], temperature: 0

    });

    const answer = response.choices[0].message.content;

    return answer;

}
// streaming version — yields chunks as they arrive from Groq
// the controller is responsible for writing SSE events to res
export const getAnswersByAiStream = async ({ context, question, memory, onChunk, onDone }) => {
    const systemPrompt = buildSystemPrompt(context, memory);

    const stream = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || "openai/gpt-oss-20b",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question }
        ],
        temperature: 0,
        stream: true  // this is the only difference
    });

    let fullAnswer = "";

    for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
            fullAnswer += token;
            onChunk(token); // controller writes this token to SSE
        }
    }

    await onDone(fullAnswer); // controller uses full answer to save to cache etc.
}