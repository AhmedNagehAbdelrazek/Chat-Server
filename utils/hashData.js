const crypto = require("crypto");
function hashData(data){
    data = String(data).replace(/['"]+/g, '');8
    console.log("ENCRYPTED DATA",data);
    console.log("ENCRYPTED DATA TYPE ",typeof(data));
    return crypto
    .createHmac("sha256","123456")
    .update(data)
    .digest("hex");
}

module.exports = hashData;