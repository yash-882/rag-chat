// operational error class for handling expected errors in the application
export default class opError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = 'failed'
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}