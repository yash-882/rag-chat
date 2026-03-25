import express from 'express'
import { 
    deleteMyFile, 
    getAnswers, 
    getMyFiles, 
    uploadFile } from '../controllers/content.controller.js'
import multerUploader from '../utils/services/multer.service.js'
import { checkRequiredFields } from '../middlewares/checkRequiFields.middleware.js'
import { authenticate } from '../middlewares/auth.middleware.js'
import { fileUploadRequirement } from '../middlewares/content.middleware.js'

const router = express.Router()

router.use(authenticate)

// content upload
router.post('/upload-file', 
multerUploader({
    fileSize: 1024 * 1024 * 5, // 5MB
    mimetypes: ['application/pdf']
}).single('file'), 

checkRequiredFields(['file'], true), 
fileUploadRequirement, 
uploadFile)

// get answers of uploaded contents
router.post('/get-answers', checkRequiredFields([
    { name: 'question', type: 'string' }
]), getAnswers)

// get all uploaded contents details
router.get('/list', getMyFiles)

// delete content by ID
router.delete('/delete/:fileId', deleteMyFile)

export default router;