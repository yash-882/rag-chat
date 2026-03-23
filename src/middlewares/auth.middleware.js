import jwt from "jsonwebtoken";
import opError from "../utils/classes/opError.class.js";

export const lowerCaseEmail = (req, res, next) => {
    req.body.email = req.body?.email?.toLowerCase().trim() || '';
    next();
}

// verify jwt before allowing to access protected routes
export const authenticate = (req, res, next) => {
    const token = req.cookies.AT;

    if (!token) {
        return next(new opError('Access denied. Please login.', 401));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new opError('Session expired. Please login again.', 401));
        }
        return next(new opError('Invalid token.', 401));
    }
};

// validate sign up fields for user registration
export const validateSignUpFields = async (req, res, next) => {

    let { email, password } = req.body || {};
    password = password.trim();

    const isValidEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);

    if (!isValidEmail) {
        return next(new opError('Invalid email format', 400));
    }

    if (password.length < 8) {
        return next(new opError('Password must be at least 8 characters long', 400));
    }

    req.body.email = email;
    req.body.password = password;

    next();
}

export const validateLoginFields = async (req, res, next) => {
    let { email, password } = req.body || {};
    password = password?.trim();

    const isValidEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
    if (!isValidEmail) {
        return next(new opError('Invalid email format', 400));
    }

    req.body.email = email;
    req.body.password = password;

    next();
}
