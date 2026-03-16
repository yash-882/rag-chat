import multer from 'multer';
import opError from '../classes/opError.class.js';

export default function uploader({
    fileSize = 1024 * 1024 * 5, // 5MB default
    mimetypes
}) {

    // runtime error 
    if (mimetypes.length === 0) {
        throw new Error('`allowedFileFormats` cannot be empty!');
    }

    // used for setup multer middleware
    const uploads = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize, //max file size
            files: 1
        },

        // check if file is an image
        fileFilter: (req, file, cb) => {

            //error on not-allowed mimetype  (mimetype eg: image/jpeg, video/mp4, etc)
            if (!mimetypes.includes(file.mimetype)) {

                // allowed file extensions
                const allowedFileExts = mimetypes.map(mimetype => mimetype.split('/')[1]);

                return cb(
                    new opError(`Only ${allowedFileExts.join(', ')} files are allowed`, 400), 
                    false
                );
            }

            else {
                cb(null, true);
            }
        }
    })

    return uploads;
}