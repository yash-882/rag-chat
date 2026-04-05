import prisma from "../configs/prisma.config.js";
import opError from "../utils/classes/opError.class.js";
import { getPdfHash } from "../utils/services/pdf.service.js";

export const fileUploadRequirement = async (req, res, next) => {
  const fileHash = getPdfHash(req.file?.buffer);

  // get all uploaded files
  const files = await prisma.pdf.findMany({
    where: {
      user_id: req.user.id
    },
    select: {
      file_hash: true
    },
  });

  const MAX_PDF_UPLOADS = process.env.MAX_PDF_UPLOADS || 10;

  // limit user from uploading more than the specified uploads limit
  if (files.length >= MAX_PDF_UPLOADS) {
    return next(
      new opError(`You have reached the maximum limit of ${MAX_PDF_UPLOADS} PDF uploads.`, 400))
  }

  // if file has already uploaded before
  else if (files.some(file => file.file_hash === fileHash)) {
    return next(new opError('This file has already been uploaded.', 409))
  }

  req.fileHash = fileHash;
  next();
}
