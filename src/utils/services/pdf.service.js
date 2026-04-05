import opError from "../classes/opError.class.js"
import crypto from 'crypto';

// removes encoded text like \n , \s
export const cleanPdfText = (text = 'defaultText') => {
    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
}

// validates extracted text of PDF
export const validatePdfResult = (pdfText = '') => {

  // if every page has no text
  if (pdfText === '') {
    throw new opError('No text found or invalid pdf', 400)
  }

}

export const getPdfChunks = (text, overlap=20, maxChunkSize=800) => {

  // excludes whitespaces
  const words = text.split(/\s+/);
  const chunks = []

  let i = 0
  let currentChunk = '';

  while (i < words.length) {    
    
    if (currentChunk.length >= maxChunkSize) {

      // get the prev chunk's last words to keep the context in current chunk
      const overlapChunk = words.slice(i - overlap, i).join(' ')

      // push chunk
      if (currentChunk.trim()) chunks.push(currentChunk.trim())

        // update with context words
        currentChunk = overlapChunk

      }

      // keep grouping the text
    currentChunk += ' ' + words[i]

    i++
  }

  // push the remaining chunk
  chunks.push(currentChunk.trim())

  return chunks;
};

// return hash string -- useful for file generating hash from a pdf file buffer
export const getPdfHash = (fileBuffer) => {
  return crypto
  .createHash('sha256')
  .update(fileBuffer)
  .digest('hex')
  .slice(0, 20);
}

// get pdf sources - useful to extract the answer sources of a question
export const getPdfSources = (results) => {
  const sourcesMap = new Map();

  // iterate to extract pdf id and name
  results.forEach(r => {
    if (!sourcesMap.has(r.pdf_id)) {
      sourcesMap.set(r.pdf_id, {
        id: r.pdf_id,
        file_name: r.file_name
      });
    }
  });
  
  return Array.from(sourcesMap.values());
}