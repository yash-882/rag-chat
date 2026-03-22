import mailjet from "../../configs/mailjet.config.js";

const sendEmail = async (to, subject, text) => {

   // send mail using Mailjet
    await mailjet.post("send", { 'version': 'v3.1' }).request({
        "Messages": [
            {
                "From": {
                    "Email": process.env.APP_EMAIL,
                    "Name": "Retreival Augmented Generation"
                },  
                "To": [
                    {
                        "Email": to,
                    }
                ],
                "Subject": subject,
                "TextPart": text,
            }
        ]
    });
}

export default sendEmail;